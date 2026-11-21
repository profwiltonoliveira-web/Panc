// Busca no Mercado Livre (Brasil).
// Estratégia:
//   1) API pública oficial (api.mercadolibre.com/sites/MLB/search). Em 2025 o ML
//      passou a exigir autenticação nesse endpoint em muitos casos (HTTP 401/403).
//   2) Se a API falhar, lê a página pública de resultados (lista.mercadolivre.com.br)
//      e extrai os anúncios do HTML.
//   3) Se a leitura direta também falhar, a interface oferece ler os anúncios de uma
//      aba do Mercado Livre aberta normalmente no navegador (ver lib/tab-reader.js).
// Nenhum resultado é inventado: se as fontes falharem, um erro com diagnóstico é lançado.

import './ml-parser.js'; // define globalThis.RadarML (script clássico, também usado na aba do ML)

const ML = globalThis.RadarML;
const API_URL = 'https://api.mercadolibre.com/sites/MLB/search';
const LIST_URL = 'https://lista.mercadolivre.com.br/';
export const { idFromUrl, safeLink, safeImage, parseBRL } = ML;

export class SearchError extends Error {
  /**
   * @param details mensagens por fonte
   * @param diagnostic diagnóstico estrutural da página recebida (quando houver)
   * @param blocked true quando a leitura direta foi bloqueada/não reconheceu anúncios
   */
  constructor(message, details = [], diagnostic = null, blocked = false) {
    super(message);
    this.details = details;
    this.diagnostic = diagnostic;
    this.blocked = blocked;
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

  let diagnostic = null;
  try {
    const r = await searchViaHtml(q, signal);
    diagnostic = r.diagnostic;
    if (r.items.length) return { source: `Página pública de busca do Mercado Livre (leitura direta, estratégia ${r.diagnostic.estrategia})`, items: r.items.slice(0, limit), diagnostic };
    errors.push('Página de busca: ' + explainEmpty(r.diagnostic));
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    diagnostic = e.diagnostic || null;
    errors.push('Página de busca: ' + e.message);
  }

  // "Sem resultados" é resposta definitiva: não há por que abrir a aba.
  const definitive = diagnostic && diagnostic.tipoDePagina === 'sem-resultados';
  throw new SearchError(definitive ? 'O Mercado Livre não encontrou anúncios para esse termo.' : 'A leitura direta não trouxe anúncios.', errors, diagnostic, !definitive);
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
    id: r.id || idFromUrl(r.permalink) || 'T:' + String(r.title || '').toLowerCase(),
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

// ---------- 2) Página pública (leitura direta por requisição) ----------
async function searchViaHtml(q, signal) {
  const slug = slugify(q);
  if (!slug) throw new Error('termo de busca sem letras ou números');
  const res = await fetch(searchUrl(q), { signal, credentials: 'include' });
  const meta = { finalUrl: res.url, status: res.status, origin: 'leitura-direta', version: extVersion() };
  if (/account-verification|\/gz\/|captcha/i.test(res.url)) {
    throw Object.assign(new Error('o Mercado Livre respondeu com uma página de verificação de segurança.'), { diagnostic: { ...meta, tipoDePagina: 'verificacao' } });
  }
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}: acesso negado ou erro no Mercado Livre.`), { diagnostic: { ...meta, tipoDePagina: 'erro-http' } });
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const parsed = ML.parseSearchDocument(doc);
  const diagnostic = ML.diagnoseDocument(doc, { ...meta, htmlLength: html.length, parsed });
  return { items: parsed.items, diagnostic };
}

export function explainEmpty(d) {
  if (!d) return 'nenhum anúncio reconhecido.';
  switch (d.tipoDePagina) {
    case 'verificacao': return 'o Mercado Livre mostrou uma verificação de segurança.';
    case 'sem-resultados': return 'o Mercado Livre não encontrou anúncios para esse termo.';
    case 'pagina-de-produto': return 'o Mercado Livre redirecionou para uma página de produto, não de resultados.';
    case 'login': return 'o Mercado Livre pediu login.';
    case 'bloqueio': return 'o Mercado Livre devolveu uma página de bloqueio ("Hubo un error accediendo a esta pagina").';
    case 'carregando': return 'a página veio só com a tela de carregamento: os anúncios são montados por JavaScript depois que a página abre, e a leitura direta não executa JavaScript. É preciso ler pela aba.';
    default:
      return `a página carregou (${d.tamanhoHtml} caracteres, ${d.elementos ? d.elementos.scripts : '?'} scripts), mas nenhum anúncio foi reconhecido` +
        (d.elementos && !d.elementos.cardsLi && !d.elementos.polyCard ? ' — os cards não vêm no HTML inicial (a página os monta via JavaScript).' : '.');
  }
}

export function searchUrl(q) {
  return LIST_URL + encodeURIComponent(slugify(q));
}

export function slugify(q) {
  return String(q).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Mantida para compatibilidade com testes: devolve só os itens.
export function parseSearchHtml(doc) {
  return ML.parseSearchDocument(doc).items;
}

function extVersion() {
  try { return chrome.runtime.getManifest().version; } catch { return null; }
}
