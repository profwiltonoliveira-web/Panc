// Busca no Mercado Livre (Brasil).
// Estratégia:
//   1) API pública oficial (api.mercadolibre.com/sites/MLB/search). Em 2025 o ML
//      passou a exigir autenticação nesse endpoint em muitos casos (HTTP 401/403).
//   2) Se a API falhar, lê a página pública de resultados (lista.mercadolivre.com.br)
//      e extrai os anúncios do HTML.
// Nenhum resultado é inventado: se as duas fontes falharem, um erro é lançado.

const API_URL = 'https://api.mercadolibre.com/sites/MLB/search';
const LIST_URL = 'https://lista.mercadolivre.com.br/';
const ML_HOST_RE = /^https:\/\/([a-z0-9-]+\.)*mercadoli(vre|bre)\.com(\.br)?\//i;

export class SearchError extends Error {
  constructor(message, details = []) {
    super(message);
    this.details = details;
  }
}

export async function searchMercadoLivre(query, { limit = 50, signal } = {}) {
  const q = String(query || '').trim();
  if (!q) throw new SearchError('Digite o nome de um produto.');
  const errors = [];

  try {
    const items = await searchViaApi(q, limit, signal);
    if (items.length) return { source: 'API oficial do Mercado Livre', items };
    errors.push('API: nenhum resultado');
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    errors.push('API: ' + e.message);
  }

  try {
    const items = await searchViaHtml(q, signal);
    if (items.length) return { source: 'Página pública de busca do Mercado Livre', items: items.slice(0, limit) };
    errors.push('Página de busca: nenhum anúncio encontrado');
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    errors.push('Página de busca: ' + e.message);
  }

  throw new SearchError('Não foi possível obter resultados do Mercado Livre.', errors);
}

// ---------- 1) API oficial ----------
async function searchViaApi(q, limit, signal) {
  const url = `${API_URL}?q=${encodeURIComponent(q)}&limit=${Math.min(limit, 50)}`;
  const res = await fetch(url, { signal, credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.results || []).map(normalizeApiItem).filter(Boolean);
}

export function normalizeApiItem(r) {
  if (!r || typeof r.price !== 'number' || !r.permalink) return null;
  const original = typeof r.original_price === 'number' && r.original_price > r.price ? r.original_price : null;
  const free = r.shipping && r.shipping.free_shipping === true;
  const link = safeLink(r.permalink);
  if (!link) return null;
  return {
    id: r.id || idFromUrl(r.permalink) || titleKey(r.title),
    title: r.title || '(sem título)',
    price: r.price,
    originalPrice: original,
    currency: r.currency_id || 'BRL',
    shipping: free ? 0 : null, // null = frete não informado
    freeShipping: !!free,
    condition: r.condition === 'used' ? 'usado' : r.condition === 'new' ? 'novo' : null,
    image: upgradeImage(r.thumbnail || ''),
    link,
    seller: (r.seller && (r.seller.nickname || r.seller.id)) || null,
    installments: r.installments ? `${r.installments.quantity}x R$ ${r.installments.amount}` : null
  };
}

// ---------- 2) Página pública ----------
async function searchViaHtml(q, signal) {
  const slug = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const res = await fetch(LIST_URL + encodeURIComponent(slug), { signal, credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const items = parseSearchHtml(doc);
  if (!items.length && /captcha|account-verification|suspicious/i.test(html)) {
    throw new Error('o Mercado Livre pediu verificação (captcha). Abra mercadolivre.com.br em uma aba, conclua a verificação e tente de novo.');
  }
  return items;
}

// Exportada para testes. Recebe um Document.
export function parseSearchHtml(doc) {
  const cards = doc.querySelectorAll('li.ui-search-layout__item, div.poly-card, div.ui-search-result__wrapper');
  const seen = new Set();
  const out = [];
  for (const card of cards) {
    // evita duplicar quando li contém o poly-card
    if (card.matches('div.poly-card') && card.closest('li.ui-search-layout__item')) continue;
    const item = parseCard(card);
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

function parseCard(card) {
  const a = card.querySelector('a.poly-component__title, h3 a, a.ui-search-link, a.ui-search-item__group__element, a[href*="mercadolivre.com.br"]');
  const titleEl = card.querySelector('.poly-component__title, .ui-search-item__title, h2, h3');
  const title = clean((titleEl && titleEl.textContent) || (a && a.textContent));
  const link = a ? safeLink(a.getAttribute('href')) : null;
  if (!title || !link) return null;

  const currentBox = card.querySelector('.poly-price__current, .ui-search-price__second-line, .ui-search-price--size-medium') || card;
  const price = readMoney(firstNonPrevious(currentBox));
  if (price == null) return null;
  const prevEl = card.querySelector('s.andes-money-amount, .andes-money-amount--previous, .ui-search-price__original-value');
  let originalPrice = prevEl ? readMoney(prevEl) : null;
  if (originalPrice != null && originalPrice <= price) originalPrice = null;

  const text = clean(card.textContent).toLowerCase();
  const freeShipping = /frete gr[aá]tis|envio gr[aá]tis/.test(text);
  let shipping = freeShipping ? 0 : null;
  if (!freeShipping) {
    const m = text.match(/frete\s*(?:de)?\s*r\$\s*([\d.]+(?:,\d{2})?)/);
    if (m) shipping = parseBRL(m[1]);
  }
  const condition = /\busado\b/.test(text) ? 'usado' : /\brecondicionado\b/.test(text) ? 'recondicionado' : null;

  const img = card.querySelector('img');
  const image = img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : '';

  const sellerEl = card.querySelector('.poly-component__seller, .ui-search-official-store-label');
  return {
    id: idFromUrl(link) || titleKey(title),
    title,
    price,
    originalPrice,
    currency: 'BRL',
    shipping,
    freeShipping,
    condition,
    image: image.startsWith('https://') ? upgradeImage(image) : '',
    link,
    seller: sellerEl ? clean(sellerEl.textContent).replace(/^por\s+/i, '') : null,
    installments: null
  };
}

function firstNonPrevious(box) {
  const all = box.querySelectorAll('.andes-money-amount');
  for (const el of all) {
    if (el.tagName === 'S' || el.classList.contains('andes-money-amount--previous') || el.closest('s')) continue;
    return el;
  }
  return null;
}

function readMoney(el) {
  if (!el) return null;
  const frac = el.querySelector('.andes-money-amount__fraction');
  if (frac) {
    const cents = el.querySelector('.andes-money-amount__cents');
    const n = Number(frac.textContent.replace(/\D/g, '')) + (cents ? Number(cents.textContent.replace(/\D/g, '')) / 100 : 0);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const m = clean(el.textContent).match(/R\$\s*([\d.]+(?:,\d{1,2})?)/);
  return m ? parseBRL(m[1]) : null;
}

// ---------- utilidades ----------
export function parseBRL(s) {
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function idFromUrl(url) {
  if (!url) return null;
  const wid = url.match(/[?&#]wid=(MLB\d+)/i);
  if (wid) return wid[1].toUpperCase();
  const m = url.match(/MLB-?U?(\d{6,})/i);
  return m ? 'MLB' + m[1] : null;
}

function titleKey(title) {
  return 'T:' + String(title || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80);
}

function safeLink(href) {
  if (!href) return null;
  try {
    const u = new URL(href, 'https://www.mercadolivre.com.br/');
    return ML_HOST_RE.test(u.href) ? u.href : null;
  } catch {
    return null;
  }
}

function upgradeImage(url) {
  // thumbnails da API vêm em baixa resolução (-I.jpg); -O é a versão maior.
  return url.replace(/^http:/, 'https:').replace(/-I\.(jpg|webp)$/i, '-O.$1');
}

function clean(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}
