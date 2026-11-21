// CLASSIFICAÇÃO LEGADA (v0.5.1) — mantida só para o relatório comparativo "antiga × nova".
// Não é usada para classificar ofertas.
// Pontuação de oportunidades (0–100) com pesos configuráveis.
//
// Dois eixos SEPARADOS:
//   - Atratividade do preço (lib/pricing.js): preço vs. equivalentes e vs. histórico do anúncio.
//   - Comprovação do desconto: só existe com histórico observado (≥ 2 dias).
// Classificação de PROMOÇÃO (rótulo) exige desconto: comprovado (excelente/boa) ou anunciado
// coerente (boa). Preço baixo sem desconto NÃO vira promoção: aparece como sinal de preço
// ("Preço competitivo"/"Preço excepcionalmente baixo"), e a pontuação reflete isso.

import { summarizeHistory } from './analyzer.js';
import { parseProduct, groupEquivalents, isAccessoryTitle } from './product.js';
import { assessPrice, peerStats, SIGNAL_TEXT } from './pricing.js';

export { isAccessoryTitle };

export const LABELS = {
  excelente: 'Excelente oportunidade',
  boa: 'Boa oportunidade',
  regular: 'Sem promoção confirmada',
  suspeito: 'Desconto suspeito'
};
export const LABEL_RANK = { suspeito: 0, regular: 1, boa: 2, excelente: 3 };

// Pesos padrão (somam 100). Configuráveis no painel.
export const DEFAULT_WEIGHTS = { preco: 35, comprovacao: 30, anunciado: 10, vendedor: 10, frete: 8, condicao: 7 };
export const WEIGHT_LABELS = {
  preco: 'Atratividade do preço',
  comprovacao: 'Desconto comprovado',
  anunciado: 'Desconto anunciado',
  vendedor: 'Vendedor',
  frete: 'Frete',
  condicao: 'Condição'
};

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

export function normalizeWeights(w) {
  const out = {};
  for (const k of Object.keys(DEFAULT_WEIGHTS)) {
    const v = Number(w && w[k]);
    out[k] = Number.isFinite(v) && v >= 0 && v <= 100 ? v : DEFAULT_WEIGHTS[k];
  }
  return out;
}

/**
 * Pontua uma oferta.
 * @param o oferta normalizada
 * @param hist resumo do histórico (summarizeHistory) ou null
 * @param peers peerStats() dos equivalentes (sem o próprio anúncio) ou null
 * @param weights pesos (DEFAULT_WEIGHTS)
 */
export function scoreOffer(o, hist, peers, weights = DEFAULT_WEIGHTS) {
  const w = normalizeWeights(weights);
  const pa = assessPrice(o, hist, peers || { n: 0, median: null });
  const s = pa.signals;
  const suspicious = s.includes('desconto-artificial') || s.includes('preco-anomalo');

  // Subnotas 0..1
  const sub = {
    preco: pa.attractiveness == null || suspicious ? 0 : pa.attractiveness / 100,
    comprovacao: pa.provenPct != null && s.includes('desconto-comprovado') ? clamp(pa.provenPct / 25) : 0,
    anunciado: s.includes('desconto-anunciado') && !suspicious ? clamp(pa.claimedPct / 50) : 0,
    vendedor: clamp(0.3 + (o.officialStore ? 0.5 : 0) + (o.rating != null && o.reviews >= 10 ? (o.rating >= 4.5 ? 0.2 : o.rating < 3.8 ? -0.3 : 0) : 0)),
    frete: o.freeShipping ? 1 : o.shipping != null ? 0.5 : 0.2,
    condicao: o.condition === 'usado' || o.condition === 'recondicionado' ? 0 : 1
  };
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  let score = Math.round(Object.keys(w).reduce((acc, k) => acc + w[k] * sub[k], 0) / total * 100);
  if (suspicious) score = Math.min(score, 30);

  // Rótulo de promoção
  let label;
  const proven = pa.provenPct != null && s.includes('desconto-comprovado') ? pa.provenPct : null;
  const aboveMarket = s.includes('acima-do-mercado');
  if (suspicious) label = 'suspeito';
  else if (proven != null && proven >= 10 && !aboveMarket) label = 'excelente';
  // Desconto anunciado só vira "boa" se houver ALGUMA referência que não o contradiga
  // (histórico ou ≥ 3 equivalentes); sem referência é "oportunidade não confirmada".
  else if ((proven != null && proven >= 3) || (s.includes('desconto-anunciado') && !s.includes('nao-confirmada') && pa.claimedPct >= 20 && !aboveMarket)) label = 'boa';
  else label = 'regular';

  // Desconto a exibir/divulgar: comprovado > anunciado coerente; suspeito não exibe desconto.
  let discountPct = null, discountKind = null;
  if (!suspicious && proven != null) { discountPct = proven; discountKind = 'comprovado'; }
  else if (!suspicious && s.includes('desconto-anunciado')) { discountPct = pa.claimedPct; discountKind = 'anunciado'; }

  const reasons = [...pa.reasons];
  if (o.officialStore) reasons.push('Loja oficial.');
  if (o.rating != null && o.reviews >= 10) reasons.push(`Avaliação ${o.rating} (${o.reviews} avaliações).`);
  if ((o.badges || []).length) reasons.push('Selos do ML: ' + o.badges.join(', ') + '.');

  return {
    score, label, labelText: LABELS[label], reasons,
    subscores: Object.fromEntries(Object.entries(sub).map(([k, v]) => [k, Math.round(v * 100)])),
    priceInfo: pa, priceSignal: pa.primary, priceSignalText: pa.primaryText,
    attractiveness: pa.attractiveness,
    discountPct, discountKind,
    previousPrice: discountKind === 'comprovado' ? pa.histAvg : null,
    vsPeers: pa.vsPeersPct,
    accessory: isAccessoryTitle(o.title)
  };
}

/**
 * Pontua todas as ofertas usando histórico e grupos de equivalentes.
 * Duplicados (mesmo ID) são unificados antes; equivalentes de vendedores diferentes continuam
 * ofertas separadas, mas servem de referência umas para as outras.
 */
export function scoreAll(offers, prices = {}, now = Date.now(), weights = DEFAULT_WEIGHTS) {
  const unique = [...new Map(offers.map((o) => [o.id, o])).values()];
  const withProduct = unique.map((o) => ({ ...o, product: parseProduct(o.title, o.condition) }));
  const groups = groupEquivalents(withProduct);
  const byGroup = new Map();
  for (const o of withProduct) {
    const k = groups.get(o.id);
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k).push(o);
  }
  return withProduct.map((o) => {
    const k = groups.get(o.id);
    const others = byGroup.get(k).filter((x) => x.id !== o.id).map((x) => x.price);
    const hist = summarizeHistory(prices[o.id], now);
    return { ...o, cluster: k, peers: others.length, ...scoreOffer(o, hist, peerStats(others), weights) };
  });
}

/** Mantida por compatibilidade: agrupa ofertas equivalentes (id -> chave). */
export function clusterOffers(offers) {
  return groupEquivalents(offers.map((o) => ({ ...o, product: parseProduct(o.title, o.condition) })));
}

/** Link limpo para divulgação (sem parâmetros de rastreamento; mantém wid/item_id). */
export function cleanLink(link) {
  try {
    const u = new URL(link);
    const keep = new URLSearchParams();
    for (const k of ['wid', 'item_id']) if (u.searchParams.get(k)) keep.set(k, u.searchParams.get(k));
    u.search = keep.toString();
    u.hash = '';
    return u.href;
  } catch { return link; }
}

/** Texto pronto para grupos de promoções. Só afirma o que foi observado/comprovado. */
export function shareText(o) {
  const lines = [`🔥 ${o.title}`, ''];
  lines.push(`💰 R$ ${fmt(o.price)}` + (o.freeShipping ? ' · Frete grátis 🚚' : ''));
  if (o.discountKind === 'comprovado') {
    lines.push(`📉 ${o.discountPct.toFixed(0)}% abaixo do preço médio que acompanhamos (R$ ${fmt(o.previousPrice)})`);
  } else if (o.discountKind === 'anunciado') {
    lines.push(`🏷️ De R$ ${fmt(o.originalPrice)} por R$ ${fmt(o.price)} (${o.discountPct.toFixed(0)}% OFF anunciado pela loja)`);
  }
  // Comparação com equivalentes: só quando há base razoável (≥ 4 anúncios equivalentes).
  if ((o.priceSignal === 'preco-excepcional' || o.priceSignal === 'preco-competitivo') && o.vsPeers != null && o.peers >= 4) {
    lines.push(`📊 ${Math.abs(o.vsPeers).toFixed(0)}% abaixo da mediana de ${o.peers} anúncios equivalentes que encontramos`);
  }
  if (o.seller) lines.push(`🏪 ${o.seller}${o.officialStore ? ' (loja oficial)' : ''}`);
  if (o.condition === 'usado' || o.condition === 'recondicionado') lines.push(`⚠️ Produto ${o.condition}`);
  lines.push('', `👉 ${cleanLink(o.link)}`, '', '_Preço e disponibilidade sujeitos a alteração._');
  return lines.join('\n');
}

export { SIGNAL_TEXT };

export function fmt(n) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
