// Busca por marca: QUALQUER marca (cadastrada ou não), consultas por linha de produto e
// verificação de que o anúncio é REALMENTE da marca.
//
// - A busca NÃO depende de cadastro: qualquer nome digitado é pesquisado (as linhas de produto
//   são descobertas pelos títulos encontrados).
// - O cadastro do usuário (chrome.storage, chave "brands") permite criar, editar e excluir marcas,
//   com apelidos (ex.: Xiaomi → redmi, poco) e linhas de produto.
// - SUGGESTIONS são só atalhos populares: não limitam nem substituem o cadastro.
// - Apelidos são texto (salváveis). "moto*" = a palavra "moto" seguida de um modelo (g54, e13, edge…).
//
// Classificação de cada anúncio em relação à marca buscada:
//   oficial      vendido pela loja oficial da marca (vendedor = marca)
//   marca        produto da marca (marca citada como fabricante no título)
//   compativel   acessório/peça de terceiros "para"/"compatível com" a marca
//   outra-marca  outra fabricante que só menciona a marca (réplica, "tipo", "estilo", outra marca antes)
//   ausente      não cita a marca (resultado irrelevante da busca)
// Só "oficial" e "marca" contam como produtos da marca; "compativel" fica separado;
// "outra-marca" e "ausente" são descartados.

import { tokens } from './analyzer.js';
import { BRAND_LIST } from './product.js';
import { categorize } from './categories.js';

const LISTA = 'https://lista.mercadolivre.com.br/';

// Sugestões populares (ATALHOS). Não são uma lista fechada: qualquer marca pode ser pesquisada.
export const SUGGESTIONS = {
  nike: { name: 'Nike', aliases: ['nike'], terms: ['tenis', 'camiseta', 'bermuda', 'mochila', 'bone', 'jaqueta', 'chuteira', 'meia'] },
  adidas: { name: 'Adidas', aliases: ['adidas'], terms: ['tenis', 'camiseta', 'calca', 'mochila', 'chuteira', 'jaqueta', 'bola'] },
  samsung: { name: 'Samsung', aliases: ['samsung'], terms: ['celular', 'smart tv', 'tablet', 'geladeira', 'lava e seca', 'fone', 'monitor', 'smartwatch'] },
  jbl: { name: 'JBL', aliases: ['jbl'], terms: ['fone', 'caixa de som', 'soundbar', 'headset', 'partybox'] },
  xiaomi: { name: 'Xiaomi', aliases: ['xiaomi', 'redmi', 'poco'], terms: ['celular', 'smartwatch', 'fone', 'aspirador robo', 'mi band', 'tv box', 'patinete'] },
  mondial: { name: 'Mondial', aliases: ['mondial'], terms: ['ventilador', 'air fryer', 'liquidificador', 'batedeira', 'cafeteira', 'ferro de passar', 'chaleira'] },
  motorola: { name: 'Motorola', aliases: ['motorola', 'moto*'], terms: ['celular', 'moto g', 'moto edge', 'fone', 'carregador'] },
  philips: { name: 'Philips', aliases: ['philips'], terms: ['air fryer', 'barbeador', 'aparador', 'secador', 'fone', 'liquidificador', 'monitor', 'lampada'] },
  electrolux: { name: 'Electrolux', aliases: ['electrolux'], terms: ['geladeira', 'fogao', 'micro-ondas', 'lava e seca', 'aspirador', 'purificador', 'air fryer'] },
  lg: { name: 'LG', aliases: ['lg'], terms: ['smart tv', 'geladeira', 'lava e seca', 'micro-ondas', 'monitor', 'ar condicionado', 'soundbar'] },
  apple: { name: 'Apple', aliases: ['apple', 'iphone', 'ipad', 'macbook', 'airpods'], terms: ['iphone', 'ipad', 'macbook', 'airpods', 'apple watch'] },
  lenovo: { name: 'Lenovo', aliases: ['lenovo'], terms: ['notebook', 'tablet', 'fone', 'monitor'] },
  britania: { name: 'Britânia', aliases: ['britania'], terms: ['air fryer', 'ventilador', 'liquidificador', 'cafeteira', 'tv'] },
  arno: { name: 'Arno', aliases: ['arno'], terms: ['liquidificador', 'ventilador', 'air fryer', 'ferro de passar', 'batedeira'] },
  tramontina: { name: 'Tramontina', aliases: ['tramontina'], terms: ['panela', 'faqueiro', 'jogo de panelas', 'churrasco', 'ferramenta'] }
};

// Palavras que, logo antes da marca, indicam produto de TERCEIROS.
const COMPAT_BEFORE = new Set(['para', 'compativel', 'p', 'pra', 'com', 'serve', 'cabe', 'universal']);
// Palavras que indicam imitação/outra fabricante.
const IMITATION = new Set(['tipo', 'estilo', 'similar', 'inspirado', 'inspirada', 'replica', 'imitacao', 'linha', 'modelo']);
const KNOWN_BRANDS = new Set(BRAND_LIST);

export const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Normaliza e valida uma marca vinda do cadastro/formulário.
 * name: 2–60 caracteres; aliases: palavras extras que identificam a marca no título;
 * terms: linhas de produto pesquisadas (até 12).
 * @returns {{ ok: true, brand } | { ok: false, error }}
 */
export function normalizeBrand(input) {
  const name = String((input && input.name) || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 60) return { ok: false, error: 'Informe um nome de marca com 2 a 60 caracteres.' };
  const tk = tokens(name);
  if (!tk.length) return { ok: false, error: 'O nome da marca precisa ter letras ou números.' };
  const list = (v) => (Array.isArray(v) ? v : String(v || '').split(','))
    .map((x) => String(x).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    .filter(Boolean);
  const aliases = [...new Set([tk.join(''), ...list(input.aliases).map((a) => (a.endsWith('*') ? tokens(a).join('') + '*' : tokens(a).join('')) ).filter((a) => a && a !== '*')])];
  const terms = [...new Set(list(input.terms).map((t) => tokens(t).join(' ')).filter(Boolean))].slice(0, 12);
  return { ok: true, brand: { name, aliases, phrase: tk.join(' '), terms } };
}

/**
 * Resolve o texto digitado para uma marca: cadastro do usuário (por id, nome ou apelido) →
 * sugestão popular → QUALQUER outro nome (marca livre, sem cadastro).
 * @param registry cadastro do usuário { id: { name, aliases, terms } }
 */
export function resolveBrand(input, registry = {}) {
  const id = slug(input);
  const key = tokens(input).join('');
  for (const src of [registry, SUGGESTIONS]) {
    if (src[id]) return { id, ...src[id], known: true, registered: src === registry };
    for (const [k, b] of Object.entries(src)) {
      if (slug(b.name) === id || (b.aliases || []).some((a) => typeof a === 'string' && a.replace(/\*$/, '') === key)) return { id: k, ...b, known: true, registered: src === registry };
    }
  }
  const name = String(input).trim();
  const tk = tokens(name);
  // Marca de várias palavras ("Black Decker"): casa a frase inteira ou a forma colada ("blackdecker").
  return { id, name, aliases: [tk.join('')], phrase: tk.join(' '), terms: [], known: false, registered: false };
}

/** Palavras que identificam OUTRAS marcas (lista base + cadastro + sugestões), exceto a buscada. */
export function otherBrandWords(brand, registry = {}) {
  const own = new Set((brand.aliases || []).map((a) => String(a).replace(/\*$/, '')));
  const out = new Set(KNOWN_BRANDS);
  for (const b of [...Object.values(SUGGESTIONS), ...Object.values(registry)]) {
    for (const a of b.aliases || []) out.add(String(a).replace(/\*$/, ''));
    const tk = tokens(b.name);
    if (tk.length === 1) out.add(tk[0]);
  }
  for (const a of own) out.delete(a);
  return out;
}

// Depois de um apelido com "*": precisa parecer modelo (letra+número curto: "g54", "e13", "g"),
// ou uma linha conhecida. "Baú para moto 45 litros" NÃO conta (45 sozinho não é modelo).
const MODEL_NEXT = (t) => /^[a-z]{1,2}\d{0,3}[a-z]?$/.test(t || '') && /\d|^[a-z]$/.test(t) || ['edge', 'razr', 'one', 'fusion'].includes(t);

function aliasHits(tt, brand) {
  const hits = [];
  const phrase = brand.phrase && brand.phrase.includes(' ') ? brand.phrase.split(' ') : null;
  tt.forEach((t, i) => {
    for (const a of brand.aliases || []) {
      if (typeof a !== 'string') continue;
      // "moto*": a palavra só conta se vier seguida de um modelo ("moto g54", "moto edge")
      if (a.endsWith('*') ? t === a.slice(0, -1) && MODEL_NEXT(tt[i + 1]) : t === a) { hits.push(i); return; }
    }
    if (phrase && phrase.every((p, j) => tt[i + j] === p)) hits.push(i);
  });
  return hits;
}

/**
 * Relação do anúncio com a marca buscada.
 * @param item { title, seller, officialStore }
 * @returns {{ match: 'oficial'|'marca'|'compativel'|'outra-marca'|'ausente', reason: string }}
 */
export function matchBrand(item, brand, others = null) {
  const tt = tokens(item.title);
  const hits = aliasHits(tt, brand);
  const sellerTk = tokens(item.seller || '');
  const sellerIsBrand = aliasHits(sellerTk, brand).length > 0;
  if (!hits.length) {
    if (sellerIsBrand && item.officialStore) return { match: 'oficial', reason: 'vendido pela loja oficial da marca' };
    return { match: 'ausente', reason: 'o título não cita a marca' };
  }
  const i = hits[0];
  const before = tt.slice(Math.max(0, i - 3), i);
  if (before.some((t) => IMITATION.has(t)) || tt.some((t) => t === 'replica' || t === 'similar' || t === 'inspirado')) {
    return { match: 'outra-marca', reason: 'título indica imitação/similar' };
  }
  // Outra fabricante conhecida citada ANTES da marca (ex.: "Tênis Olympikus … Nike")
  const otherSet = others || otherBrandWords(brand);
  const otherBefore = tt.slice(0, i).find((t) => otherSet.has(t));
  // Mesmo com "para"/"compatível", é produto de OUTRA fabricante (ex.: "Fone Xiaomi … Para Samsung").
  if (otherBefore) return { match: 'outra-marca', reason: `outra marca (${otherBefore}) citada como fabricante` };
  const compat = before.some((t) => COMPAT_BEFORE.has(t)) || tt.slice(0, i).includes('compativel');
  if (compat) {
    if (sellerIsBrand && item.officialStore) return { match: 'oficial', reason: 'acessório vendido pela loja oficial da marca' };
    return { match: 'compativel', reason: 'acessório/peça de terceiros para a marca' };
  }
  if (sellerIsBrand && item.officialStore) return { match: 'oficial', reason: 'loja oficial da marca' };
  return { match: 'marca', reason: 'marca citada como fabricante no título' };
}

/** Consultas (páginas de busca do ML) para uma marca: a marca sozinha + uma por linha de produto. */
export function buildBrandSources(brand, { maxTerms = 8, maxPages = 2 } = {}) {
  const base = brand.phrase || (brand.aliases && typeof brand.aliases[0] === 'string' ? brand.aliases[0] : slug(brand.name).replace(/-/g, ' '));
  const name = brand.name;
  const list = [{ id: `marca-${brand.id}`, name: `${name}: todos`, url: LISTA + slug(base), category: null, brand: brand.id, term: '', paginate: { maxPages } }];
  for (const term of (brand.terms || []).slice(0, maxTerms)) {
    list.push({ id: `marca-${brand.id}-${slug(term)}`, name: `${name}: ${term}`, url: LISTA + slug(`${term} ${base}`), category: null, brand: brand.id, term, paginate: { maxPages } });
  }
  return list;
}

/**
 * Para marcas não cadastradas: descobre linhas de produto a partir dos títulos encontrados
 * (palavras-chave de categoria mais frequentes). Só usa o que apareceu nos anúncios.
 */
export function learnTerms(items, max = 4) {
  const freq = new Map();
  for (const it of items) {
    const cat = categorize(it.title);
    if (cat === 'outros') continue;
    const first = tokens(it.title).find((t) => t.length > 3 && !/\d/.test(t));
    if (first) freq.set(first, (freq.get(first) || 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([t]) => t);
}

/** URL da próxima página de resultados do ML (formato _Desde_N). */
export function nextPageUrl(url, offset) {
  const clean = url.replace(/_Desde_\d+(_NoIndex_True)?$/, '');
  return `${clean}_Desde_${offset}_NoIndex_True`;
}
