// Pontuação e classificação de oportunidades (v0.6).
//
// DOIS INDICADORES SEPARADOS (0–100 cada):
//   A) Desconto real (lib/pricing.js → assessDiscount): evidência de REDUÇÃO de preço —
//      comprovado (histórico) > corroborado (equivalentes) > campanha oficial do ML > só anunciado.
//   B) Atratividade do preço (lib/pricing.js → assessPrice): preço atual vs. anúncios EQUIVALENTES
//      (e vs. o histórico do próprio anúncio). Sem referência = "sem referência" (null).
//
// CINCO CLASSES:
//   excelente  · desconto comprovado ≥ 10% (e não acima do mercado), OU
//              · preço ≥ 25% abaixo da mediana de ≥ 5 equivalentes (evidência forte sem histórico), OU
//              · desconto corroborado por ≥ 4 equivalentes ≥ 20%
//   boa        · desconto comprovado ≥ 3%, OU corroborado ≥ 10%, OU
//              · preço ≥ 25% abaixo de 4 equivalentes, OU
//              · campanha oficial do ML ≥ 20% sem contradição
//   competitivo· preço ≥ 8% abaixo da mediana de ≥ 3 equivalentes (sem desconto confirmado)
//   regular    · o resto (inclui desconto só anunciado, sem nada que o confirme)
//   suspeita   · desconto artificial ou preço anômalo (> 60% abaixo de equivalentes)
// Nenhum preço de referência é inventado: cada classe aponta a evidência usada (em "Por quê?").

import { summarizeHistory } from './analyzer.js';
import { parseProduct, groupEquivalents, isAccessoryTitle } from './product.js';
import { assessPrice, assessDiscount, peerStats, SIGNAL_TEXT, DISCOUNT_TEXT } from './pricing.js';

export { isAccessoryTitle, SIGNAL_TEXT, DISCOUNT_TEXT };

export const LABELS = {
  excelente: 'Excelente oportunidade',
  boa: 'Boa oportunidade',
  competitivo: 'Preço competitivo',
  regular: 'Preço regular',
  suspeito: 'Oferta suspeita'
};
export const LABEL_RANK = { suspeito: 0, regular: 1, competitivo: 2, boa: 3, excelente: 4 };

// Pesos padrão (somam 100). Configuráveis no painel.
export const DEFAULT_WEIGHTS = { desconto: 35, preco: 35, vendedor: 12, frete: 10, condicao: 8 };
export const WEIGHT_LABELS = {
  desconto: 'Desconto real (A)',
  preco: 'Atratividade do preço (B)',
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
 * Classe a partir dos dois indicadores. Exportada para o relatório e testes.
 */
export function classify(pa, disc, peers) {
  const s = pa.signals;
  if (s.includes('desconto-artificial') || s.includes('preco-anomalo')) return { label: 'suspeito', basis: s.includes('preco-anomalo') ? 'preço anômalo frente a equivalentes' : 'desconto artificial' };
  const above = s.includes('acima-do-mercado');
  const vs = pa.vsPeersPct; // % (negativo = mais barato)
  const n = peers ? peers.n : 0;
  const exceptional = vs != null && vs <= -25;
  if (disc.level === 'comprovado' && disc.pct >= 10 && !above) return { label: 'excelente', basis: `desconto comprovado de ${disc.pct.toFixed(0)}%` };
  if (exceptional && n >= 5) return { label: 'excelente', basis: `preço ${Math.abs(vs).toFixed(0)}% abaixo de ${n} equivalentes` };
  if (disc.level === 'corroborado' && disc.pct >= 20 && n >= 4) return { label: 'excelente', basis: `desconto de ${disc.pct.toFixed(0)}% confirmado por ${n} equivalentes` };
  if (disc.level === 'comprovado' && disc.pct >= 3) return { label: 'boa', basis: `desconto comprovado de ${disc.pct.toFixed(0)}%` };
  if (disc.level === 'corroborado' && disc.pct >= 10) return { label: 'boa', basis: `desconto de ${disc.pct.toFixed(0)}% confirmado por ${n} equivalentes` };
  if (exceptional && n >= 4) return { label: 'boa', basis: `preço ${Math.abs(vs).toFixed(0)}% abaixo de ${n} equivalentes` };
  if (disc.level === 'campanha' && disc.pct >= 20 && !above) return { label: 'boa', basis: `${disc.pct.toFixed(0)}% OFF em campanha oficial do ML (${disc.evidence})` };
  if (vs != null && vs <= -8 && n >= 3) return { label: 'competitivo', basis: `preço ${Math.abs(vs).toFixed(0)}% abaixo de ${n} equivalentes` };
  return { label: 'regular', basis: disc.level === 'anunciado' ? 'desconto só anunciado, sem confirmação' : (pa.attractiveness == null ? 'sem referência de preço' : 'preço na média') };
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
  const pr = peers || { n: 0, median: null };
  const pa = assessPrice(o, hist, pr);
  const disc = assessDiscount(o, pa, pr);
  const cls = classify(pa, disc, pr);
  const suspicious = cls.label === 'suspeito';

  // Subnotas 0..1
  const sub = {
    desconto: suspicious ? 0 : disc.value / 100,
    preco: pa.attractiveness == null || suspicious ? 0 : pa.attractiveness / 100,
    vendedor: clamp(0.3 + (o.officialStore ? 0.5 : 0) + (o.rating != null && o.reviews >= 10 ? (o.rating >= 4.5 ? 0.2 : o.rating < 3.8 ? -0.3 : 0) : 0)),
    frete: o.freeShipping ? 1 : o.shipping != null ? 0.5 : 0.2,
    condicao: o.condition === 'usado' || o.condition === 'recondicionado' ? 0 : 1
  };
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  let score = Math.round(Object.keys(w).reduce((acc, k) => acc + w[k] * sub[k], 0) / total * 100);
  if (suspicious) score = Math.min(score, 30);

  // Desconto a exibir/divulgar (nível de evidência explícito); suspeita não exibe desconto.
  let discountPct = null, discountKind = null;
  if (!suspicious && disc.level !== 'nenhum' && disc.level !== 'artificial') {
    discountKind = disc.level;
    discountPct = disc.level === 'comprovado' || disc.level === 'corroborado' ? disc.pct : pa.claimedPct;
  }

  const reasons = [`Classe: ${LABELS[cls.label]} — ${cls.basis}.`, `Desconto real (A): ${disc.text}${disc.evidence ? ' (' + disc.evidence + ')' : ''}.`, ...pa.reasons];
  if (o.officialStore) reasons.push('Loja oficial.');
  if (o.rating != null && o.reviews >= 10) reasons.push(`Avaliação ${o.rating} (${o.reviews} avaliações).`);
  if ((o.badges || []).length) reasons.push('Selos do ML: ' + o.badges.join(', ') + '.');

  return {
    score, label: cls.label, labelText: LABELS[cls.label], basis: cls.basis, reasons,
    subscores: Object.fromEntries(Object.entries(sub).map(([k, v]) => [k, Math.round(v * 100)])),
    realDiscount: disc,
    priceInfo: pa, priceSignal: pa.primary, priceSignalText: pa.primaryText,
    attractiveness: pa.attractiveness,
    discountPct, discountKind,
    previousPrice: disc.level === 'comprovado' ? pa.histAvg : null,
    peerMedian: pr.median,
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

/** Texto pronto para grupos de promoções. Só afirma o que foi observado e diz a fonte da evidência. */
export function shareText(o) {
  const lines = [`🔥 ${o.title}`, ''];
  lines.push(`💰 R$ ${fmt(o.price)}` + (o.freeShipping ? ' · Frete grátis 🚚' : ''));
  if (o.discountKind === 'comprovado') {
    lines.push(`📉 ${o.discountPct.toFixed(0)}% abaixo do preço médio que acompanhamos (R$ ${fmt(o.previousPrice)})`);
  } else if (o.discountKind === 'corroborado') {
    lines.push(`🏷️ De R$ ${fmt(o.originalPrice)} por R$ ${fmt(o.price)} — ${o.discountPct.toFixed(0)}% abaixo do preço de ${o.peers} anúncios equivalentes`);
  } else if (o.discountKind === 'campanha') {
    lines.push(`🏷️ De R$ ${fmt(o.originalPrice)} por R$ ${fmt(o.price)} (${o.discountPct.toFixed(0)}% OFF em oferta do Mercado Livre)`);
  } else if (o.discountKind === 'anunciado') {
    lines.push(`🏷️ De R$ ${fmt(o.originalPrice)} por R$ ${fmt(o.price)} (${o.discountPct.toFixed(0)}% OFF anunciado pela loja)`);
  }
  // Comparação com equivalentes: só quando há base razoável (≥ 4 anúncios equivalentes).
  if (o.discountKind !== 'corroborado' && (o.priceSignal === 'preco-excepcional' || o.priceSignal === 'preco-competitivo') && o.vsPeers != null && o.peers >= 4) {
    lines.push(`📊 ${Math.abs(o.vsPeers).toFixed(0)}% abaixo da mediana de ${o.peers} anúncios equivalentes que encontramos`);
  }
  if (o.seller) lines.push(`🏪 ${o.seller}${o.officialStore ? ' (loja oficial)' : ''}`);
  if (o.condition === 'usado' || o.condition === 'recondicionado') lines.push(`⚠️ Produto ${o.condition}`);
  lines.push('', `👉 ${cleanLink(o.link)}`, '', '_Preço e disponibilidade sujeitos a alteração._');
  return lines.join('\n');
}

export function fmt(n) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
