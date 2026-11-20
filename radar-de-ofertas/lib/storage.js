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
const MAX_ITEMS = 2500;
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

  for (const it of analysis.items) {
    // IDs derivados do título (sem ID de anúncio no link) não são confiáveis para histórico.
    if (String(it.id).startsWith('T:')) continue;
    const e = prices[it.id] || { title: it.title, link: it.link, image: it.image, points: [] };
    e.title = it.title;
    e.link = it.link;
    e.image = it.image || e.image;
    const last = e.points[e.points.length - 1];
    if (last && now - last.t < MIN_GAP_MS) {
      last.price = it.price; // atualiza o ponto recente em vez de duplicar
      last.total = it.total;
    } else {
      e.points.push({ t: now, price: it.price, total: it.total });
      if (e.points.length > MAX_POINTS) e.points.splice(0, e.points.length - MAX_POINTS);
    }
    prices[it.id] = e;
  }
  prune(prices, watch);
  await area().set({ searches, prices });
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
  await area().remove(['searches', 'prices', 'watch']);
}

export async function bytesInUse() {
  try { return await area().getBytesInUse(null); } catch { return null; }
}

export async function exportJson() {
  return JSON.stringify(await getAll(), null, 2);
}
