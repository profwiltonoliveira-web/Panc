// Persistência local via chrome.storage.local (nada sai do navegador).
// Chaves:
//   searches: [{ q, t, source, count, equivalentCount, min, median, max }]   (mais recentes primeiro)
//   prices:   { [itemId]: { title, link, image, points: [{ t, price, total }] } }
//   watch:    { [itemId]: { title, link, image, addedAt, priceAtAdd } }
//
// chrome.storage.local tem cota de ~10 MB sem a permissão "unlimitedStorage".
// Para não estourar, o histórico é podado: no máximo MAX_ITEMS anúncios
// (os vistos há mais tempo saem primeiro; itens acompanhados nunca são removidos).

const MAX_SEARCHES = 200;
const MAX_POINTS = 120;
const MAX_ITEMS = 5000;
const MIN_GAP_MS = 60 * 60 * 1000; // no máximo 1 ponto por hora por anúncio

const area = () => chrome.storage.local;

export async function getAll() {
  const { searches = [], prices = {}, watch = {} } = await area().get(['searches', 'prices', 'watch']);
  return { searches, prices, watch };
}

export async function getPriceHistory() {
  const { prices = {} } = await area().get('prices');
  return prices;
}

export async function recordSearch(query, source, analysis, now = Date.now()) {
  const { searches = [], prices = {}, watch = {} } = await area().get(['searches', 'prices', 'watch']);
  const s = analysis.stats;
  searches.unshift({ q: query, t: now, source, count: s.count, equivalentCount: s.equivalentCount, min: s.refMin, median: s.median, max: s.max });
  if (searches.length > MAX_SEARCHES) searches.length = MAX_SEARCHES;

  addObservations(prices, analysis.items, now);
  prune(prices, watch);
  const { offers = {}, scans = [] } = await area().get(['offers', 'scans']);
  const report = pruneBySize({ prices, offers, scans, searches, watch }, await otherKeysBytes(['prices', 'offers', 'scans', 'searches', 'watch']), now);
  await area().set(report.changed.offers || report.changed.scans ? { searches, prices, offers, scans } : { searches, prices });
}

// Registra preços observados (no máximo 1 ponto por anúncio por hora).
export function addObservations(prices, items, now = Date.now()) {
  for (const it of items) {
    // IDs derivados do título (sem ID de anúncio no link) não são confiáveis para histórico.
    if (String(it.id).startsWith('T:')) continue;
    const e = prices[it.id] || { title: it.title, link: it.link, image: it.image, points: [] };
    e.title = it.title;
    e.link = it.link;
    e.image = it.image || e.image;
    const last = e.points[e.points.length - 1];
    if (last && now - last.t < MIN_GAP_MS) {
      last.price = it.price; // atualiza o ponto recente em vez de duplicar
      if (it.total != null && it.total !== it.price) last.total = it.total; else delete last.total;
    } else {
      // "total" só é guardado quando difere do preço (economiza espaço)
      const pt = { t: now, price: it.price };
      if (it.total != null && it.total !== it.price) pt.total = it.total;
      e.points.push(pt);
      if (e.points.length > MAX_POINTS) e.points.splice(0, e.points.length - MAX_POINTS);
    }
    prices[it.id] = e;
  }
}

export function prune(prices, watch, max = MAX_ITEMS) {
  const ids = Object.keys(prices);
  if (ids.length <= max) return 0;
  const lastT = (id) => { const p = prices[id].points; return p.length ? p[p.length - 1].t : 0; };
  const removable = ids.filter((id) => !watch[id]).sort((a, b) => lastT(a) - lastT(b));
  const n = Math.min(ids.length - max, removable.length);
  for (let i = 0; i < n; i++) delete prices[removable[i]];
  return n;
}

export async function toggleWatch(item) {
  const { watch = {} } = await area().get('watch');
  if (watch[item.id]) delete watch[item.id];
  else watch[item.id] = { title: item.title, link: item.link, image: item.image, addedAt: Date.now(), priceAtAdd: item.price };
  await area().set({ watch });
  return !!watch[item.id];
}

export async function clearAll() {
  await area().remove(['searches', 'prices', 'watch', 'offers', 'scans', 'radarState', 'sourceStats', 'lastPrune', 'backoff']);
}

export async function bytesInUse() {
  try { return await area().getBytesInUse(null); } catch { return null; }
}

export async function exportJson() {
  return JSON.stringify(await getAll(), null, 2);
}

// ---------- Radar automático ----------
// offers:   { [id]: oferta + { category, sources[], firstSeen, lastSeen } }  (ofertas vistas recentemente)
// scans:    [{ t, finished, mode, sources: [{ id, name, url, status, count, method, error, diagnostic }], found, newOffers }]
// settings: { interval, pages, categories, allowTabManual, allowTabAuto, notify, minNotifyLabel }
// radarState: { running, startedAt, current, done, total, message, needsUser, tabId }

export const DEFAULT_SETTINGS = { interval: 0, pages: 1, categories: [], allowTabManual: true, allowTabAuto: false, notify: true, weights: null };
const OFFER_TTL = 3 * 24 * 60 * 60 * 1000; // ofertas não vistas há 3 dias saem do painel (o histórico de preços fica)
const MAX_SCANS = 50;

export async function getSettings() {
  const { settings = {} } = await area().get('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function saveSettings(patch) {
  const s = { ...(await getSettings()), ...patch };
  await area().set({ settings: s });
  return s;
}

export async function getRadar() {
  const { offers = {}, scans = [], prices = {}, watch = {}, radarState = null } = await area().get(['offers', 'scans', 'prices', 'watch', 'radarState']);
  return { offers, scans, prices, watch, radarState };
}

export async function setRadarState(state) {
  await area().set({ radarState: state });
}

/**
 * Mescla ofertas encontradas numa fonte: deduplica por ID, registra preço observado.
 * @returns {{ added: number, updated: number }}
 */
export async function mergeOffers(items, source, now = Date.now()) {
  const { offers = {}, prices = {}, watch = {} } = await area().get(['offers', 'prices', 'watch']);
  let added = 0, updated = 0;
  for (const it of items) {
    const prev = offers[it.id];
    if (prev) {
      updated++;
      offers[it.id] = {
        ...prev, ...it,
        // categoria de uma página de categoria prevalece sobre a inferida pelo título
        category: source.category ? source.category : prev.categoryFromSource ? prev.category : (it.category || prev.category),
        categoryFromSource: !!(source.category || prev.categoryFromSource),
        image: it.image || prev.image,
        sources: [...new Set([...(prev.sources || []), source.id])],
        firstSeen: prev.firstSeen,
        lastSeen: now
      };
    } else {
      added++;
      offers[it.id] = { ...it, categoryFromSource: !!source.category, sources: [source.id], firstSeen: now, lastSeen: now };
    }
  }
  for (const [id, o] of Object.entries(offers)) if (now - o.lastSeen > OFFER_TTL && !watch[id]) delete offers[id];
  addObservations(prices, items, now);
  prune(prices, watch);
  const { scans = [], searches = [] } = await area().get(['scans', 'searches']);
  const report = pruneBySize({ prices, offers, scans, searches, watch }, await otherKeysBytes(['prices', 'offers', 'scans', 'searches', 'watch']), now);
  await area().set(report.changed.scans || report.changed.searches ? { offers, prices, scans, searches } : { offers, prices });
  if (report.pruned) await area().set({ lastPrune: { t: now, before: report.before, after: report.after, removed: report.removed } });
  return { added, updated };
}

export async function saveScan(scan) {
  const { scans = [] } = await area().get('scans');
  const i = scans.findIndex((s) => s.t === scan.t);
  if (i >= 0) scans[i] = scan; else scans.unshift(scan);
  if (scans.length > MAX_SCANS) scans.length = MAX_SCANS;
  await area().set({ scans });
}

export async function clearOffers() {
  await area().remove(['offers', 'scans', 'radarState']);
}

// ---------- Poda por espaço efetivamente utilizado ----------
// Cota do chrome.storage.local sem "unlimitedStorage": 10 MB. A poda começa ao passar de 70%
// e reduz até 55%, nesta ordem (registros importantes por último e favoritos NUNCA):
//   1) pontos de preço com mais de 14 dias → 1 por dia (o último observado do dia);
//   2) diagnósticos de varreduras antigas (mantém os das 5 últimas);
//   3) ofertas não vistas há mais de 24 h (o histórico de preços delas fica);
//   4) pesquisas manuais além das 50 mais recentes;
//   5) históricos de preço menos recentes, primeiro os que não estão no painel.
// Favoritos (watch), configurações e estatísticas de fontes não são podados.

export const QUOTA_BYTES = 10 * 1024 * 1024;
export const PRUNE_START = 0.7;
export const PRUNE_TARGET = 0.55;
const DAY_MS = 24 * 60 * 60 * 1000;
const enc = new TextEncoder();
// chrome.storage mede chave + JSON do valor em bytes; esta estimativa segue a mesma regra.
export const bytesOf = (key, value) => enc.encode(key).length + enc.encode(JSON.stringify(value)).length;

async function otherKeysBytes(exclude) {
  try {
    const all = await area().get(null);
    let n = 0;
    for (const [k, v] of Object.entries(all)) if (!exclude.includes(k)) n += bytesOf(k, v);
    return n;
  } catch { return 0; }
}

/**
 * Poda in-place os dados até caber no orçamento.
 * @param data { prices, offers, scans, searches, watch }
 * @param otherBytes bytes das demais chaves (settings, sourceStats, …)
 * @returns { before, after, pruned, removed, changed }
 */
export function pruneBySize(data, otherBytes = 0, now = Date.now(), quota = QUOTA_BYTES) {
  const { prices, offers, scans, searches, watch = {} } = data;
  const changed = {};
  const removed = { pontosCompactados: 0, diagnosticos: 0, ofertas: 0, pesquisas: 0, historicos: 0 };
  const sizeOf = () => otherBytes + bytesOf('prices', prices) + bytesOf('offers', offers) + bytesOf('scans', scans) + bytesOf('searches', searches) + bytesOf('watch', watch);
  const before = sizeOf();
  const start = quota * PRUNE_START, target = quota * PRUNE_TARGET;
  if (before <= start) return { before, after: before, pruned: false, removed, changed };

  // 1) compacta pontos antigos: 1 por dia
  for (const e of Object.values(prices)) {
    const keep = [];
    const seenDay = new Map();
    for (const p of e.points) {
      if (now - p.t <= 14 * DAY_MS) { keep.push(p); continue; }
      const d = Math.floor(p.t / DAY_MS);
      if (seenDay.has(d)) { keep[seenDay.get(d)] = p; removed.pontosCompactados++; } // fica o último do dia
      else { seenDay.set(d, keep.length); keep.push(p); }
    }
    e.points = keep;
  }
  changed.prices = true;
  let size = sizeOf();

  // 2) diagnósticos de varreduras antigas
  if (size > target) {
    scans.forEach((sc, i) => {
      if (i < 5) return;
      for (const src of sc.sources || []) if (src.diagnostic) { delete src.diagnostic; removed.diagnosticos++; }
    });
    changed.scans = true;
    size = sizeOf();
  }
  // 3) ofertas não vistas há mais de 24 h
  if (size > target) {
    for (const [id, o] of Object.entries(offers)) if (!watch[id] && now - o.lastSeen > DAY_MS) { delete offers[id]; removed.ofertas++; }
    changed.offers = true;
    size = sizeOf();
  }
  // 4) pesquisas manuais antigas
  if (size > target && searches.length > 50) {
    removed.pesquisas += searches.length - 50;
    searches.length = 50;
    changed.searches = true;
    size = sizeOf();
  }
  // 5) históricos menos recentes (fora do painel primeiro), nunca favoritos
  if (size > target) {
    const lastT = (id) => { const p = prices[id].points; return p.length ? p[p.length - 1].t : 0; };
    const ids = Object.keys(prices).filter((id) => !watch[id])
      .sort((a, b) => (!!offers[a] - !!offers[b]) || (lastT(a) - lastT(b)));
    let excess = size - target;
    for (const id of ids) {
      if (excess <= 0) break;
      excess -= bytesOf(id, prices[id]) + 2;
      delete prices[id];
      removed.historicos++;
    }
    size = sizeOf();
  }
  return { before, after: size, pruned: true, removed, changed };
}

/** Uso real do armazenamento, por chave. */
export async function storageReport() {
  const all = await area().get(null);
  const perKey = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, bytesOf(k, v)]));
  let used = Object.values(perKey).reduce((a, b) => a + b, 0);
  try { used = await area().getBytesInUse(null); } catch { /* estimativa */ }
  return {
    used, quota: QUOTA_BYTES, perKey,
    counts: { ofertas: Object.keys(all.offers || {}).length, historicos: Object.keys(all.prices || {}).length, favoritos: Object.keys(all.watch || {}).length, varreduras: (all.scans || []).length },
    lastPrune: all.lastPrune || null
  };
}

// ---------- Estatísticas acumuladas por fonte (auditoria de fontes) ----------
// sourceStats: { [id]: { name, runs, okRuns, items, unique, added, accessories, emptyRuns, lastRun, lastItems, lastUnique } }
export async function updateSourceStats(scanRec) {
  const { sourceStats = {} } = await area().get('sourceStats');
  for (const r of scanRec.sources) {
    if (r.skipped) continue;
    const s = sourceStats[r.id] || { name: r.name, runs: 0, okRuns: 0, items: 0, unique: 0, added: 0, accessories: 0, emptyRuns: 0 };
    s.name = r.name;
    s.runs++;
    if (r.status === 'ok') { s.okRuns++; s.emptyRuns = 0; } else s.emptyRuns++;
    s.items += r.count || 0;
    s.unique += r.unique || 0;
    s.added += r.added || 0;
    s.accessories += r.accessories || 0;
    s.lastRun = scanRec.t;
    s.lastItems = r.count || 0;
    s.lastUnique = r.unique || 0;
    s.lastStatus = r.status;
    sourceStats[r.id] = s;
  }
  await area().set({ sourceStats });
  return sourceStats;
}

export async function getSourceStats() {
  const { sourceStats = {} } = await area().get('sourceStats');
  return sourceStats;
}
