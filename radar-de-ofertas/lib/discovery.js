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
import { BRANDS, resolveBrand, matchBrand, buildBrandSources, learnTerms, nextPageUrl } from './brands.js';
import { CATEGORY_BY_ID } from './categories.js';

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

// Intervalo mínimo GLOBAL entre requisições ao ML (vale entre tarefas diferentes também:
// ex.: uma busca por marca iniciada logo após outra terminar).
let lastRequestAt = 0;
async function throttle() {
  const wait = lastRequestAt + PAGE_DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

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
  await throttle();
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
  /** visible: janela normal sem foco (em vez de minimizada) — só na varredura manual, ver scan(). */
  constructor({ visible = false } = {}) { this.tabId = null; this.windowId = null; this.ownWindow = false; this.visible = visible; }

  async open() {
    if (this.tabId != null) return;
    try {
      const w = await chrome.windows.create(this.visible
        ? { url: 'about:blank', focused: false, state: 'normal', width: 1024, height: 768 }
        : { url: 'about:blank', focused: false, state: 'minimized' });
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
    await throttle();
    await this.navigate(url);
    await chrome.scripting.executeScript({ target: { tabId: this.tabId }, files: ['lib/ml-parser.js'] });
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: this.tabId },
      func: (v) => globalThis.__radarExtract({ timeout: 30000, version: v }), // espera inteligente, máx. 30 s
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
  return { tipoDePagina: d.tipoDePagina, estrategia: d.estrategia, anunciosLidos: d.anunciosLidos, status: d.status, url: d.url, titulo: d.titulo, tamanhoHtml: d.tamanhoHtml, elementos: d.elementos, porEstrategia: d.porEstrategia, classes: d.classes, origem: d.origem, espera: d.espera };
}

/**
 * Executa uma varredura. mode: 'manual' (usuário clicou) ou 'auto' (alarme).
 * @returns resumo da varredura
 */
export function runRadar(mode = 'manual') {
  return runJob({ kind: 'radar', mode });
}

/**
 * Executa uma tarefa de descoberta. Uma por vez (respeita os limites das fontes).
 * job: { kind: 'radar' | 'marca' | 'categoria', mode: 'manual' | 'auto', brand?: string, category?: string }
 */
export function runJob(job) {
  if (running) return running;
  stopRequested = false;
  running = scan(job.mode || 'manual', job)
    .catch(async (e) => {
      // Falha inesperada: registra no estado (visível no painel e no diagnóstico) em vez de sumir.
      console.error('Radar: varredura falhou', e);
      await store.setRadarState({ running: false, mode: job.mode || 'manual', job: { kind: job.kind || 'radar', label: job.kind === 'marca' ? `Marca: ${job.brand}` : 'Radar' }, startedAt: Date.now(), error: String((e && e.stack) || e), message: 'A varredura falhou por um erro interno: ' + String((e && e.message) || e) });
      return null;
    })
    .finally(() => { running = null; });
  return running;
}

async function brandRegistry() {
  const { customBrands } = await store.getBrandData();
  return { ...BRANDS, ...customBrands };
}

/** Fontes da tarefa: radar (+ marcas monitoradas), marca ou categoria. */
async function jobSources(job, settings, stats) {
  if (job.kind === 'marca') {
    const brand = resolveBrand(job.brand, (await store.getBrandData()).customBrands);
    return { sources: buildBrandSources(brand, { maxTerms: 8, maxPages: 2 }), brand };
  }
  if (job.kind === 'categoria') {
    const pages = 3;
    const list = buildSources({ categories: [job.category], pages }).filter((s) => s.category === job.category);
    return { sources: list, label: (CATEGORY_BY_ID[job.category] || {}).name };
  }
  const list = prioritizeSources(buildSources(settings), stats);
  // Marcas monitoradas: poucas consultas por marca (marca + 2 linhas, só pág. 1) em cada varredura.
  const reg = await brandRegistry();
  for (const id of settings.monitorBrands || []) {
    const b = reg[id] ? { id, ...reg[id] } : resolveBrand(id, reg);
    list.push(...buildBrandSources(b, { maxTerms: 2, maxPages: 1 }).map((x) => ({ ...x, monitored: true })));
  }
  return { sources: list };
}

async function scan(mode, job = { kind: 'radar' }) {
  const settings = await store.getSettings();
  const allowTab = mode === 'manual' ? settings.allowTabManual : settings.allowTabAuto;
  const { backoff = {} } = await chrome.storage.local.get('backoff');
  const now0 = Date.now();
  const stats = await store.getSourceStats();
  const js = await jobSources(job, settings, stats);
  const all = js.sources;
  const sources = mode === 'auto' ? all.filter((s) => !(backoff[s.id] > now0)) : all;
  const reg = await brandRegistry();
  const brandOf = (id) => (js.brand && js.brand.id === id ? js.brand : reg[id] ? { id, ...reg[id] } : resolveBrand(id, reg));
  const jobInfo = { kind: job.kind || 'radar', brand: js.brand ? js.brand.id : null, brandName: js.brand ? js.brand.name : null, category: job.category || null, label: js.brand ? `Marca: ${js.brand.name}` : js.label ? `Categoria: ${js.label}` : 'Radar' };
  const brandTally = { kept: 0, compat: 0, excluded: 0, categories: {}, learned: [] };
  const seenInScan = new Set();
  const byBase = new Map(); // resultado da página anterior de cada fonte
  const scanRec = { t: now0, mode, job: jobInfo, finished: null, sources: [], found: 0, newOffers: 0, stoppedReason: null };
  let session = new TabSession();
  let tabBlocked = false, directFailStreak = 0;
  const state = (extra) => store.setRadarState({ running: true, mode, job: jobInfo, startedAt: now0, total: sources.length, done: scanRec.sources.length, found: scanRec.found, ...extra });

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
          await state({ message: `Lendo ${src.name} numa aba do navegador…`, current: src.name });
          let r = await session.read(src.url);
          // Página presa no carregamento com a janela oculta: na varredura manual, tenta UMA vez
          // numa janela normal sem foco (o Chrome pode pausar páginas ocultas). Nada é contornado.
          const hiddenLoading = (x) => x.diagnostic && x.diagnostic.tipoDePagina === 'carregando' && x.diagnostic.espera && x.diagnostic.espera.visibilidadeFinal === 'hidden';
          if (!r.items.length && hiddenLoading(r) && mode === 'manual' && !session.visible) {
            await session.close();
            session = new TabSession({ visible: true });
            rec.retriedVisible = true;
            await state({ message: `${src.name}: a página não carregou em segundo plano; tentando numa janela visível…`, current: src.name });
            r = await session.read(src.url);
          }
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
          } else if (kind === 'carregando') {
            rec.error = (rec.error ? rec.error + '; ' : '') + `aba: a página ficou carregando por ${Math.round(((r.diagnostic.espera && r.diagnostic.espera.ms) || 30000) / 1000)} s sem mostrar anúncios`;
          } else rec.error = (rec.error ? rec.error + '; ' : '') + (kind === 'sem-resultados' ? 'aba: página sem resultados' : 'aba: layout desconhecido — nenhum anúncio reconhecido');
        } catch (e) {
          rec.error = (rec.error ? rec.error + '; ' : '') + 'aba: ' + (e.message || e);
        }
      }

      if (items.length) {
        // Duplicados dentro da própria página (mesmo ID) contam uma vez.
        items = [...new Map(items.map((it) => [it.id, it])).values()];
        let enriched = items.map((it) => ({ ...it, category: src.category || categorize(it.title) }));
        // Busca por marca: só fica o que é REALMENTE da marca; acessórios de terceiros ficam marcados.
        if (src.brand) {
          const brand = brandOf(src.brand);
          const kept = [];
          for (const it of enriched) {
            const m = matchBrand(it, brand);
            if (m.match === 'outra-marca' || m.match === 'ausente') { rec.excluded = (rec.excluded || 0) + 1; brandTally.excluded++; continue; }
            if (m.match === 'compativel') { rec.compat = (rec.compat || 0) + 1; brandTally.compat++; } else { brandTally.kept++; brandTally.categories[it.category] = (brandTally.categories[it.category] || 0) + 1; }
            kept.push({ ...it, brands: { [brand.id]: m.match } });
          }
          enriched = kept;
          // Marca não cadastrada: aprende linhas de produto com os títulos da 1ª página
          if (job.kind === 'marca' && !src.term && !src.page && js.brand && !(js.brand.terms || []).length) {
            const learned = learnTerms(kept.filter((x) => x.brands[brand.id] !== 'compativel'));
            brandTally.learned = learned;
            const extra = learned.map((term) => ({ id: `marca-${brand.id}-${term}`, name: `${brand.name}: ${term}`, url: src.url.replace(/[^/]+$/, '') + `${term}-${src.url.split('/').pop()}`, category: null, brand: brand.id, term, paginate: { maxPages: 1 } }));
            sources.splice(i + 1, 0, ...extra);
          }
        }
        const { added } = enriched.length ? await store.mergeOffers(enriched, src) : { added: 0 };
        rec.status = 'ok';
        rec.count = items.length;
        rec.unique = items.filter((it) => !seenInScan.has(it.id)).length; // não vistos em fontes anteriores desta varredura
        rec.added = added;                                                  // nunca vistos antes pelo Radar
        rec.accessories = items.filter((it) => isAccessoryTitle(it.title)).length;
        items.forEach((it) => seenInScan.add(it.id));
        scanRec.found += items.length;
        scanRec.newOffers += added;
        // Paginação (busca por marca): próxima página só se esta foi cheia e trouxe anúncios novos.
        const page = src.page || 1;
        if (src.paginate && page < src.paginate.maxPages && rec.count >= 40 && rec.unique / rec.count >= NEXT_PAGE_MIN_UNIQUE) {
          sources.splice(i + 1, 0, { ...src, id: `${src.id.replace(/-p\d+$/, '')}-p${page + 1}`, name: `${src.name.replace(/ \(pág\. \d+\)$/, '')} (pág. ${page + 1})`, url: nextPageUrl(src.url, page * rec.count + 1), page: page + 1 });
        }
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
      // (intervalo entre requisições garantido por throttle())
    }
  } finally {
    await session.close();
    scanRec.finished = Date.now();
    await store.saveScan(scanRec);
    try { await store.updateSourceStats(scanRec); } catch { /* estatística não pode derrubar a varredura */ }
    if (job.kind === 'marca' && js.brand) {
      scanRec.brand = { id: js.brand.id, name: js.brand.name, ...brandTally };
      await store.saveScan(scanRec);
      await store.addBrandSearch({ t: now0, finished: scanRec.finished, brand: js.brand.id, name: js.brand.name, known: js.brand.known, found: scanRec.found, kept: brandTally.kept, compat: brandTally.compat, excluded: brandTally.excluded, categories: brandTally.categories, learnedTerms: brandTally.learned, sources: scanRec.sources.filter((x) => !x.skipped).length, ok: scanRec.sources.filter((x) => x.status === 'ok').length, stoppedReason: scanRec.stoppedReason });
    }
    await chrome.storage.local.set({ backoff });
    await store.setRadarState({ running: false, mode, job: jobInfo, startedAt: now0, finishedAt: scanRec.finished, total: sources.length, done: scanRec.sources.length, found: scanRec.found, newOffers: scanRec.newOffers, needsUser: scanRec.needsUser || null, stoppedReason: scanRec.stoppedReason, message: summaryMessage(scanRec) });
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
