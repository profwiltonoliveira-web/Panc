// Busca no Mercado Livre (Brasil).
// Estratégia:
//   1) API pública oficial (api.mercadolibre.com/sites/MLB/search). Em 2025 o ML
//      passou a exigir autenticação nesse endpoint em muitos casos (HTTP 401/403).
//   2) Se a API falhar, lê a página pública de resultados (lista.mercadolivre.com.br)
//      e extrai os anúncios do HTML.
// Nenhum resultado é inventado: se as duas fontes falharem, um erro é lançado.

const API_URL = 'https://api.mercadolibre.com/sites/MLB/search';
const LIST_URL = 'https://lista.mercadolivre.com.br/';
// Hosts aceitos para links de anúncio (hostname exato ou subdomínio).
const ML_HOST_RE = /^([a-z0-9-]+\.)*mercadoli(vre|bre)\.com(\.br)?$/i;

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
    image: safeImage(r.thumbnail || ''),
    link,
    seller: (r.seller && (r.seller.nickname || r.seller.id)) || null,
    installments: r.installments ? `${r.installments.quantity}x R$ ${r.installments.amount}` : null
  };
}

// ---------- 2) Página pública ----------
async function searchViaHtml(q, signal) {
  const slug = slugify(q);
  if (!slug) throw new Error('termo de busca sem letras ou números');
  const res = await fetch(LIST_URL + encodeURIComponent(slug), { signal, credentials: 'include' });
  // O ML redireciona para /gz/account-verification quando suspeita de acesso automatizado.
  if (/account-verification|\/gz\/|captcha/i.test(res.url)) throw new Error(VERIFY_MSG);
  if (res.status === 403) throw new Error('HTTP 403: acesso negado pelo Mercado Livre. Abra mercadolivre.com.br em uma aba (se pedir verificação, conclua) e tente de novo. Redes de empresa/VPN/servidores podem ser bloqueadas.');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const items = parseSearchHtml(doc);
  if (!items.length && /captcha|account-verification|suspicious/i.test(html)) throw new Error(VERIFY_MSG);
  if (!items.length && !/nenhum resultado|não há anúncios|nao ha anuncios|verifique se a palavra/i.test(html)) {
    throw new Error('a página carregou, mas nenhum anúncio foi reconhecido (o layout do site pode ter mudado).');
  }
  return items;
}

const VERIFY_MSG = 'o Mercado Livre pediu verificação de segurança. Abra mercadolivre.com.br em uma aba, conclua a verificação e tente de novo.';

export function slugify(q) {
  return String(q).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Exportada para testes. Recebe um Document.
export function parseSearchHtml(doc) {
  const cards = doc.querySelectorAll('li.ui-search-layout__item, div.poly-card, div.ui-search-result__wrapper');
  const seen = new Set();
  const out = [];
  for (const card of cards) {
    // evita processar o mesmo anúncio duas vezes quando um card contém outro
    if (card.parentElement && card.parentElement.closest('li.ui-search-layout__item, div.poly-card, div.ui-search-result__wrapper')) continue;
    const item = parseCard(card);
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

// querySelector com lista separada por vírgula devolve o primeiro na ORDEM DO DOCUMENTO,
// não na ordem de prioridade. pick() respeita a prioridade.
function pick(root, selectors) {
  for (const s of selectors) {
    const el = root.querySelector(s);
    if (el) return el;
  }
  return null;
}

function parseCard(card) {
  // Link e título vêm do MESMO elemento sempre que possível, para o link apontar para o anúncio do título.
  const a = pick(card, ['a.poly-component__title', 'h3 a[href]', 'h2 a[href]', 'a.ui-search-item__group__element', 'a.ui-search-link']);
  const titleEl = pick(card, ['.poly-component__title', '.ui-search-item__title', 'h3', 'h2']);
  const title = clean((titleEl && titleEl.textContent) || (a && a.textContent));
  const link = a ? safeLink(a.getAttribute('href')) : null;
  if (!title || !link) return null;

  const currentBox = pick(card, ['.poly-price__current', '.ui-search-price__second-line', '.ui-search-price--size-medium']);
  const price = readMoney(firstCurrentAmount(currentBox || card));
  if (price == null) return null;
  const prevEl = pick(card, ['s.andes-money-amount', '.andes-money-amount--previous', '.ui-search-price__original-value']);
  let originalPrice = prevEl ? readMoney(prevEl) : null;
  if (originalPrice != null && originalPrice <= price) originalPrice = null;

  const text = clean(card.textContent).toLowerCase();
  const freeShipping = /frete gr[aá]tis|envio gr[aá]tis|chegar[aá] gr[aá]tis/.test(text);
  let shipping = freeShipping ? 0 : null;
  if (!freeShipping) {
    const m = text.match(/frete\s*(?:de)?\s*r\$\s*([\d.]+(?:,\d{2})?)/);
    if (m) shipping = parseBRL(m[1]);
  }
  const condition = /\brecondicionado\b/.test(text) ? 'recondicionado' : /\busado\b/.test(text) ? 'usado' : null;

  const img = pick(card, ['img.poly-component__picture', 'img']);
  const image = img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : '';

  const sellerEl = pick(card, ['.poly-component__seller', '.ui-search-official-store-label']);
  return {
    id: idFromUrl(link) || titleKey(title),
    title,
    price,
    originalPrice,
    currency: 'BRL',
    shipping,
    freeShipping,
    condition,
    image: safeImage(image),
    link,
    seller: sellerEl ? clean(sellerEl.textContent).replace(/^por\s+/i, '') : null,
    installments: null
  };
}

// Primeiro valor que não seja o preço riscado ("de") nem parcela ("12x R$ ...").
function firstCurrentAmount(box) {
  for (const el of box.querySelectorAll('.andes-money-amount')) {
    if (el.tagName === 'S' || el.classList.contains('andes-money-amount--previous') || el.closest('s')) continue;
    if (el.closest('.poly-price__installments, .ui-search-installments, .poly-component__installments')) continue;
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

/**
 * Identificador estável do anúncio a partir do link.
 *  - wid=MLB123 / item_id=MLB123 (anúncio específico dentro de página de catálogo) → "MLB123"
 *  - /MLB-123-titulo-_JM (anúncio)                                                   → "MLB123"
 *  - /p/MLB123 (produto de catálogo, vários vendedores)                              → "P:MLB123"
 *  - /up/MLBU123 (produto de usuário)                                                → "U:MLBU123"
 * Só o CAMINHO é analisado: parâmetros como container_id=MLB779362 ou
 * c_category_id=MLB263532 são IDs de categoria/vitrine e não identificam anúncios.
 */
export function idFromUrl(url) {
  if (!url) return null;
  let u;
  try { u = new URL(url, 'https://www.mercadolivre.com.br/'); } catch { return null; }
  const hashParams = new URLSearchParams(u.hash.replace(/^#/, ''));
  const wid = u.searchParams.get('wid') || u.searchParams.get('item_id') || hashParams.get('wid');
  if (wid && /^MLB\d{6,}$/i.test(wid)) return wid.toUpperCase();
  const path = u.pathname;
  let m = path.match(/\/MLB-(\d{6,})(?:[-_/]|$)/i);
  if (m) return 'MLB' + m[1];
  m = path.match(/\/p\/(MLB\d{6,})(?:[/?]|$)/i);
  if (m) return 'P:' + m[1].toUpperCase();
  m = path.match(/\/up\/(MLBU\d{6,})(?:[/?]|$)/i);
  if (m) return 'U:' + m[1].toUpperCase();
  m = path.match(/\/(MLB\d{6,})(?:[/?_-]|$)/i);
  if (m) return m[1].toUpperCase();
  return null;
}

function titleKey(title) {
  return 'T:' + String(title || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80);
}

export function safeLink(href) {
  if (!href) return null;
  try {
    const u = new URL(href, 'https://www.mercadolivre.com.br/');
    return u.protocol === 'https:' && ML_HOST_RE.test(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

// Só aceita imagens do CDN do Mercado Livre (evita carregar pixels de rastreamento de terceiros).
export function safeImage(url) {
  if (!url) return '';
  try {
    const u = new URL(String(url).replace(/^http:/, 'https:'));
    if (u.protocol !== 'https:' || !/(^|\.)mlstatic\.com$/i.test(u.hostname)) return '';
    return u.href.replace(/-I\.(jpg|webp)$/i, '-O.$1'); // thumbnails da API: -I (pequena) → -O (maior)
  } catch {
    return '';
  }
}

function clean(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}
