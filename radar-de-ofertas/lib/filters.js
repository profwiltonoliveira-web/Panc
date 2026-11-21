// Filtros do painel (lógica pura, testável sem navegador).
//
// SINAIS DE PREÇO — cada oferta pertence a UM OU MAIS sinais (classificação múltipla):
//   os sinais detectados (priceInfo.signals) + o sinal principal (priceSignal).
// O sinal principal cobre os estados que não são "sinais" detectados — 'regular' (preço na média)
// e 'sem-referencia' (sem equivalentes nem histórico). Assim TODA oferta é encontrável por
// pelo menos uma opção do filtro (antes, ofertas com signals = [] não apareciam em nenhuma).

export const SIGNAL_OPTIONS = [
  ['desconto-comprovado', 'Desconto comprovado'],
  ['preco-excepcional', 'Preço excepcionalmente baixo'],
  ['preco-competitivo', 'Preço competitivo'],
  ['desconto-anunciado', 'Desconto anunciado'],
  ['nao-confirmada', 'Oportunidade não confirmada'],
  ['desconto-artificial', 'Desconto artificial'],
  ['preco-anomalo', 'Preço anômalo'],
  ['acima-do-mercado', 'Acima do mercado'],
  ['regular', 'Preço na média'],
  ['sem-referencia', 'Sem referência de preço']
];
export const SIGNAL_KEYS = SIGNAL_OPTIONS.map(([k]) => k);

/** Normaliza um identificador de sinal ("Preço Competitivo", "preco_competitivo" → "preco-competitivo"). */
export function normKey(v) {
  return String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Rótulo visual normalizado → chave (o filtro aceita a chave interna OU o rótulo exibido).
const LABEL_TO_KEY = Object.fromEntries(SIGNAL_OPTIONS.map(([k, label]) => [normKey(label), k]));
export function signalKeyOf(v) {
  const k = normKey(v);
  return LABEL_TO_KEY[k] || k;
}

/** Todos os sinais de uma oferta (normalizados, sem repetição). Nunca vazio para ofertas pontuadas. */
export function signalKeys(o) {
  const out = new Set();
  const pi = o && o.priceInfo;
  for (const s of (pi && Array.isArray(pi.signals) ? pi.signals : [])) out.add(normKey(s));
  if (o && o.priceSignal) out.add(normKey(o.priceSignal));
  else if (pi && pi.primary) out.add(normKey(pi.primary));
  return [...out].filter(Boolean);
}

export const LABEL_RANK = { suspeito: 0, regular: 1, competitivo: 2, boa: 3, excelente: 4 };
/** Classe: "suspeito"/"regular" = exatamente; demais = essa classe ou melhor. */
export function labelOk(o, lbl) {
  if (!lbl) return true;
  if (lbl === 'suspeito' || lbl === 'regular') return o.label === lbl;
  return o.label !== 'suspeito' && (LABEL_RANK[o.label] ?? -1) >= LABEL_RANK[lbl];
}

/**
 * Aplica os filtros.
 * @param list ofertas pontuadas (scoreAll)
 * @param f { text, category, group, groupOf(cat)→grupo, min, max, disc, proven, signal, free, cond, label, noAcc }
 * @param skip nome de um critério a ignorar (para contagens por opção)
 */
export function applyOfferFilters(list, f = {}, skip = null) {
  const text = String(f.text || '').trim().toLowerCase();
  const min = Number(f.min) || 0;
  const max = Number(f.max) || Infinity;
  const disc = Number(f.disc) || 0;
  const signal = signalKeyOf(f.signal);
  return list.filter((o) => {
    if (f.group && f.groupOf && f.groupOf(o.category) !== f.group) return false;
    if (f.category && o.category !== f.category) return false;
    if (text && !String(o.title || '').toLowerCase().includes(text)) return false;
    if (!(o.price >= min && o.price <= max)) return false;
    if (disc && !(o.discountPct >= disc)) return false;
    if (f.proven && o.discountKind !== 'comprovado') return false;
    if (skip !== 'signal' && signal && !signalKeys(o).includes(signal)) return false;
    if (f.free && !o.freeShipping) return false;
    const used = o.condition === 'usado' || o.condition === 'recondicionado';
    if (f.cond === 'novo' && used) return false;
    if (f.cond === 'usado' && !used) return false;
    if (!labelOk(o, f.label)) return false;
    if (f.noAcc && o.accessory) return false;
    return true;
  });
}

/** Contagem por opção de sinal, respeitando os DEMAIS filtros (o próprio sinal é ignorado). */
export function signalCounts(list, f = {}) {
  const base = applyOfferFilters(list, f, 'signal');
  const counts = Object.fromEntries(SIGNAL_KEYS.map((k) => [k, 0]));
  let semSinal = 0, invalido = 0;
  for (const o of base) {
    const ks = signalKeys(o);
    if (!ks.length) semSinal++;
    for (const k of ks) { if (k in counts) counts[k]++; else invalido++; }
  }
  return { total: base.length, counts, semSinal, invalido };
}

export function sortOffers(list, sort) {
  const out = list.slice();
  if (sort === 'discount') out.sort((a, b) => (b.discountPct || 0) - (a.discountPct || 0));
  else if (sort === 'price') out.sort((a, b) => a.price - b.price);
  else if (sort === 'new') out.sort((a, b) => (b.firstSeen || 0) - (a.firstSeen || 0));
  else out.sort((a, b) => b.score - a.score);
  return out;
}
