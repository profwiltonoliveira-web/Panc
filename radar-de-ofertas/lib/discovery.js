// Motor de descoberta do Radar (roda no service worker).
//
// Para cada fonte pública do Mercado Livre (lib/categories.js → buildSources):
//   1) leitura direta (fetch + DOMParser no documento offscreen);
//   2) se não trouxer anúncios e for permitido: leitura numa aba de uma janela minimizada,
//      reutilizada para todas as fontes (a página é aberta normalmente pelo navegador).
// Verificação de segurança, login ou bloqueio NÃO são contornados: a varredura para de usar
// a aba, registra o motivo e pede ação do usuário.
// Respeito aos limites: intervalo entre páginas, poucas páginas por categoria, recuo
// (backoff) automático de fontes bloqueadas e intervalo mínimo de 30 min no monitoramento.

import { buildSources, categorize } from './categories.js';
import * as store from './storage.js';
import { scoreAll, LABEL_RANK } from './scoring.js';
import { isAccessoryTitle } from './product.js';

const PAGE_DELAY_MS = 3000;
const BACKOFF_MS = 6 * 60 * 60 * 1000;
const NAV_TIMEOUT_MS = 30000;
// Paginação só continua se a página anterior foi produtiva (evita requisições inúteis).
const NEXT_PAGE_MIN_ITEMS = 20;
const NEXT_PAGE_MIN_UNIQUE = 0.4;
// Fonte improdutiva (≥ 3 varreduras seguidas sem anúncios) é pulada no automático por 24 h.
const UNPRODUCTIVE_RUNS = 3;
const UNPRODUCTIVE_SKIP_MS = 24 * 60 * 60 * 1000;

/**
 * Ordena as fontes: a página geral primeiro; depois as mais produtivas (anúncios ÚNICOS por
 * varredura, histórico acumulado); fontes nunca lidas mantêm a ordem original. Páginas 2+
 * ficam logo após a página anterior da mesma fonte.
 */
export function prioritizeSources(list, stats = {}) {
  const base = (id) => id.replace(/-p\d+$/, '');
  const yieldOf = (id) => { const s = stats[base(id)]; return s && s.runs ? s.unique / s.runs : null; };
  const firstPages = list.filter((s) => !/-p\d+$/.test(s.id));
  const idx = new Map(firstPages.map((s, i) => [s.id, i]));
  firstPages.sort((a, b) => {
    if (a.id === 'ofertas') return -1;
    if (b.id === 'ofertas') return 1;
    const ya = yieldOf(a.id), yb = yieldOf(b.id);
    if (ya == null && yb == null) return idx.get(a.id) - idx.get(b.id);
    if (ya == null) return -1; // nunca lida: dá a chance
    if (yb == null) return 1;
    return yb - ya || idx.get(a.id) - idx.get(b.id);
  });
  const out = [];
  for (const f of firstPages) out.push(f, ...list.filter((s) => base(s.id) === f.id && s.id !== f.id));
  return out;
}

let running = null;
let stopRequested = false;

export const isRunning = () => !!running;
export function requestStop() { stopRequested = true; }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- leitura direta (offscreen) ----------
async function ensureOffscreen() {
  try {
    if (chrome.offscreen.hasDocument && await chrome.offscreen.hasDocument()) return;
  } catch { /* versões antigas: tenta criar */ }
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_PARSER'],
      justification: 'Ler o HTML das páginas públicas de ofertas do Mercado Livre.'
    });
  } catch (e) {
    if (!/single offscreen|already/i.test(String(e.message))) throw e;
  }
}

async function readDirect(url) {
  await ensureOffscreen();
  const msg = { target: 'offscreen', type: 'read', url, version: chrome.runtime.getManifest().version };
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await chrome.runtime.sendMessage(msg);
      return r || { items: [], error: 'sem resposta do leitor', diagnostic: null };
    } catch (e) {
      // Documento recém-criado ainda carregando o script: tenta de novo rapidamente.
      if (attempt < 3 && /Receiving end does not exist/i.test(String(e.message))) { await sleep(300); continue; }
      throw e;
    }
  }
}

// ---------- leitura por aba (janela minimizada reutilizada) ----------
class TabSession {
  constructor() { this.tabId = null; this.windowId = null; this.ownWindow = false; }

  async open() {
    if (this.tabId != null) return;
    try {
      const w = await chrome.windows.create({ url: 'about:blank', focused: false, state: 'minimized' });
      this.windowId = w.id;
      this.tabId = w.tabs[0].id;
      this.ownWindow = true;
    } catch {
      const t = await chrome.tabs.create({ url: 'about:blank', active: false });
      this.tabId = t.id;
    }
  }

  navigate(url) {
    const tabId = this.tabId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { done(); reject(new Error('a página demorou demais para carregar')); }, NAV_TIMEOUT_MS);
      const onUpd = (id, info, tab) => {
        if (id === tabId && info.status === 'complete' && tab.url && tab.url !== 'about:blank') { done(); resolve(); }
      };
      const onRem = (id) => { if (id === tabId) { done(); reject(new Error('a aba foi fechada')); } };
      function done() { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(onUpd); chrome.tabs.onRemoved.removeListener(onRem); }
      chrome.tabs.onUpdated.addListener(onUpd);
      chrome.tabs.onRemoved.addListener(onRem);
      chrome.tabs.update(tabId, { url }).catch((e) => { done(); reject(e); });
    });
  }

  async read(url) {
    await this.open();
    await this.navigate(url);
    await chrome.scripting.executeScript({ target: { tabId: this.tabId }, files: ['lib/ml-parser.js'] });
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: this.tabId },
      func: (v) => globalThis.__radarExtract({ timeout: 6000, version: v }),
      args: [chrome.runtime.getManifest().version]
    });
    return res && res.result ? res.result : { items: [], diagnostic: null };
  }

  async close() {
    try {
      if (this.ownWindow && this.windowId != null) await chrome.windows.remove(this.windowId);
      else if (this.tabId != null) await chrome.tabs.remove(this.tabId);
    } catch { /* já fechada */ }
    this.tabId = this.windowId = null;
  }

  /** Mantém a aba aberta e a mostra ao usuário (verificação/login). */
  async reveal() {
    if (this.tabId == null) return null;
    try {
      if (this.ownWindow) await chrome.windows.update(this.windowId, { state: 'normal', focused: false });
    } catch { /* ignore */ }
    const id = this.tabId;
    this.tabId = this.windowId = null; // não fecha mais
    return id;
  }
}

const NEEDS_USER = { verificacao: 'verificação de segurança', login: 'login', bloqueio: 'bloqueio de acesso' };

function compactDiag(d) {
  if (!d) return null;
  return { tipoDePagina: d.tipoDePagina, estrategia: d.estrategia, anunciosLidos: d.anunciosLidos, status: d.status, url: d.url, titulo: d.titulo, tamanhoHtml: d.tamanhoHtml, elementos: d.elementos, porEstrategia: d.porEstrategia, classes: d.classes, origem: d.origem };
}

/**
 * Executa uma varredura. mode: 'manual' (usuário clicou) ou 'auto' (alarme).
 * @returns resumo da varredura
 */
export function runRadar(mode = 'manual') {
  if (running) return running;
  stopRequested = false;
  running = scan(mode).finally(() => { running = null; });
  return running;
}

async function scan(mode) {
  const settings = await store.getSettings();
  const allowTab = mode === 'manual' ? settings.allowTabManual : settings.allowTabAuto;
  const { backoff = {} } = await chrome.storage.local.get('backoff');
  const now0 = Date.now();
  const stats = await store.getSourceStats();
  const all = prioritizeSources(buildSources(settings), stats);
  const sources = mode === 'auto' ? all.filter((s) => !(backoff[s.id] > now0)) : all;
  const seenInScan = new Set();
  const byBase = new Map(); // resultado da página anterior de cada fonte
  const scanRec = { t: now0, mode, finished: null, sources: [], found: 0, newOffers: 0, stoppedReason: null };
  const session = new TabSession();
  let tabBlocked = false, directFailStreak = 0;
  const state = (extra) => store.setRadarState({ running: true, mode, startedAt: now0, total: sources.length, done: scanRec.sources.length, found: scanRec.found, ...extra });

  await state({ message: 'Iniciando…' });
  try {
    for (let i = 0; i < sources.length; i++) {
      if (stopRequested) { scanRec.stoppedReason = 'interrompido pelo usuário'; break; }
      const src = sources[i];
      const baseId = src.id.replace(/-p\d+$/, '');
      const rec = { id: src.id, name: src.name, url: src.url, status: 'erro', count: 0, unique: 0, added: 0, accessories: 0, method: null, error: null, diagnostic: null };
      // Pula paginação improdutiva e fontes improdutivas (só no automático) — sem requisição.
      const prev = byBase.get(baseId);
      if (prev && (prev.count < NEXT_PAGE_MIN_ITEMS || prev.unique / (prev.count || 1) < NEXT_PAGE_MIN_UNIQUE)) {
        rec.status = 'pulada'; rec.skipped = true;
        rec.error = `página anterior pouco produtiva (${prev.count} anúncios, ${prev.unique} novos)`;
        scanRec.sources.push(rec);
        continue;
      }
      const st = stats[baseId];
      if (mode === 'auto' && !/-p\d+$/.test(src.id) && st && st.emptyRuns >= UNPRODUCTIVE_RUNS && now0 - st.lastRun < UNPRODUCTIVE_SKIP_MS) {
        rec.status = 'pulada'; rec.skipped = true;
        rec.error = `sem anúncios nas últimas ${st.emptyRuns} varreduras; nova tentativa em até 24 h`;
        scanRec.sources.push(rec);
        continue;
      }
      await state({ message: `Lendo ${src.name}…`, current: src.name });
      let items = [];

      // 1) leitura direta
      try {
        const r = await readDirect(src.url);
        rec.diagnostic = compactDiag(r.diagnostic);
        if (r.items.length) { items = r.items; rec.method = 'direta'; directFailStreak = 0; }
        else { rec.error = 'leitura direta: ' + (r.error || 'sem anúncios'); directFailStreak++; }
      } catch (e) {
        rec.error = 'leitura direta: ' + (e.message || e);
        directFailStreak++;
      }

      // 2) aba do navegador — só se a página não disse claramente "sem resultados";
      //    respeita o mesmo intervalo entre requisições.
      const emptyPage = rec.diagnostic && rec.diagnostic.tipoDePagina === 'sem-resultados';
      if (!items.length && allowTab && !tabBlocked && !emptyPage) {
        try {
          await sleep(PAGE_DELAY_MS);
          await state({ message: `Lendo ${src.name} numa aba do navegador…`, current: src.name });
          const r = await session.read(src.url);
          rec.diagnostic = compactDiag(r.diagnostic);
          const kind = r.diagnostic && r.diagnostic.tipoDePagina;
          if (r.items.length) { items = r.items; rec.method = 'aba'; rec.directError = rec.error; rec.error = null; }
          else if (NEEDS_USER[kind]) {
            tabBlocked = true;
            rec.status = 'bloqueado';
            rec.error = `o Mercado Livre exibiu ${NEEDS_USER[kind]} — nada foi contornado`;
            if (mode === 'manual') {
              const tabId = await session.reveal();
              const what = kind === 'bloqueio' ? 'O Mercado Livre bloqueou o acesso (comum com VPN, proxy ou rede de empresa).' : `O Mercado Livre pediu ${NEEDS_USER[kind]}.`;
              scanRec.needsUser = { tabId, kind, message: `${what} Resolva na janela aberta e clique em "Atualizar".` };
            }
          } else rec.error = (rec.error ? rec.error + '; ' : '') + 'aba: nenhum anúncio reconhecido';
        } catch (e) {
          rec.error = (rec.error ? rec.error + '; ' : '') + 'aba: ' + (e.message || e);
        }
      }

      if (items.length) {
        // Duplicados dentro da própria página (mesmo ID) contam uma vez.
        items = [...new Map(items.map((it) => [it.id, it])).values()];
        const enriched = items.map((it) => ({ ...it, category: src.category || categorize(it.title) }));
        const { added } = await store.mergeOffers(enriched, src);
        rec.status = 'ok';
        rec.count = items.length;
        rec.unique = items.filter((it) => !seenInScan.has(it.id)).length; // não vistos em fontes anteriores desta varredura
        rec.added = added;                                                  // nunca vistos antes pelo Radar
        rec.accessories = items.filter((it) => isAccessoryTitle(it.title)).length;
        items.forEach((it) => seenInScan.add(it.id));
        scanRec.found += items.length;
        scanRec.newOffers += added;
      } else if (rec.status !== 'bloqueado') {
        rec.status = rec.diagnostic && rec.diagnostic.tipoDePagina === 'sem-resultados' ? 'vazio' : 'erro';
      }
      if (rec.status === 'bloqueado' || (rec.status === 'erro' && /HTTP 403|verifica/.test(rec.error || ''))) backoff[src.id] = Date.now() + BACKOFF_MS;
      byBase.set(baseId, rec);
      scanRec.sources.push(rec);
      await store.saveScan(scanRec);

      // Fonte inteira inacessível: não insiste em todas as páginas.
      if (!allowTab || tabBlocked) {
        if (directFailStreak >= 3 && scanRec.found === 0) { scanRec.stoppedReason = 'leitura direta bloqueada em 3 fontes seguidas' + (tabBlocked ? ' e aba com verificação/bloqueio' : ' e leitura por aba desativada'); break; }
      }
      if (i < sources.length - 1) await sleep(PAGE_DELAY_MS);
    }
  } finally {
    await session.close();
    scanRec.finished = Date.now();
    await store.saveScan(scanRec);
    try { await store.updateSourceStats(scanRec); } catch { /* estatística não pode derrubar a varredura */ }
    await chrome.storage.local.set({ backoff });
    await store.setRadarState({ running: false, mode, startedAt: now0, finishedAt: scanRec.finished, total: sources.length, done: scanRec.sources.length, found: scanRec.found, newOffers: scanRec.newOffers, needsUser: scanRec.needsUser || null, stoppedReason: scanRec.stoppedReason, message: summaryMessage(scanRec) });
  }
  return scanRec;
}

function summaryMessage(s) {
  const ok = s.sources.filter((x) => x.status === 'ok').length;
  const read = s.sources.filter((x) => !x.skipped).length;
  const skipped = s.sources.length - read;
  let m = `${s.found} anúncios lidos em ${ok} de ${read} fontes consultadas; ${s.newOffers} novos.` + (skipped ? ` ${skipped} fonte(s) pulada(s) por baixa produtividade.` : '');
  if (s.stoppedReason) m += ' Varredura interrompida: ' + s.stoppedReason + '.';
  if (s.needsUser) m += ' ' + s.needsUser.message;
  return m;
}

/** Ofertas novas desta varredura com classificação mínima (para notificações). */
export async function newGoodOffers(scanRec, minLabel = 'boa') {
  const { offers, prices } = await store.getRadar();
  const settings = await store.getSettings();
  const list = scoreAll(Object.values(offers), prices, Date.now(), settings.weights || undefined);
  return list.filter((o) => o.firstSeen >= scanRec.t && LABEL_RANK[o.label] >= LABEL_RANK[minLabel]).sort((a, b) => b.score - a.score);
}
