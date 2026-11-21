// Pontuação de oportunidades do radar (0–100) e agrupamento de produtos equivalentes.
//
// Regras centrais:
//  - "Desconto comprovado" só existe com HISTÓRICO observado pela extensão (≥ 2 observações
//    anteriores, em dias distintos). Preço "de" anunciado pela loja é "desconto anunciado".
//  - Preço baixo ≠ desconto: estar abaixo da mediana de produtos equivalentes vale pontos
//    próprios ("preço competitivo"), mas não é chamado de desconto.
//  - "Excelente" exige desconto comprovado. Sinais contraditórios viram "Desconto suspeito".

import { tokens, summarizeHistory, median } from './analyzer.js';

export const LABELS = {
  excelente: 'Excelente oportunidade',
  boa: 'Boa oportunidade',
  regular: 'Preço regular',
  suspeito: 'Desconto suspeito'
};
export const LABEL_RANK = { suspeito: 0, regular: 1, boa: 2, excelente: 3 };

// Palavras que, no início do título, indicam acessório/peça (não o produto principal).
const ACCESSORY_LEAD = new Set(['capa', 'capinha', 'case', 'pelicula', 'suporte', 'carregador', 'cabo', 'adaptador', 'protetor', 'estojo', 'refil', 'peca', 'pecas', 'tela', 'display', 'bateria', 'almofada', 'almofadas', 'ponteira', 'ponteiras', 'skin', 'adesivo', 'controle', 'pulseira', 'carcaca']);
const NOISE = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'pra', 'o', 'a', 'em', 'no', 'na', 'novo', 'nova', 'original', 'lacrado', 'oferta', 'promocao', 'envio', 'imediato', 'frete', 'gratis', 'garantia', 'nf', 'nota', 'fiscal', 'pronta', 'entrega', 'cor', 'preto', 'preta', 'branco', 'branca', 'azul', 'vermelho', 'vermelha', 'verde', 'rosa', 'cinza', 'prata', 'dourado', 'grafite', 'roxo', 'lilas', 'amarelo', 'bege', 'marrom', 'titanio', 'unidade', 'un', 'pc', 'pcs']);

/** true se o título descreve um acessório/peça ("Capa para iPhone", "Película Galaxy", "Compatível com…"). */
export function isAccessoryTitle(title) {
  const tt = tokens(title).filter((t) => !NOISE.has(t) || t === 'para');
  if (!tt.length) return false;
  if (ACCESSORY_LEAD.has(tt[0])) return true;
  if (tt.slice(0, 6).includes('compativel')) return true;
  // "Película de vidro para ...", "Cabo usb para ..."
  const para = tt.indexOf('para');
  return para > 0 && para <= 3 && tt.slice(0, para).some((t) => ACCESSORY_LEAD.has(t));
}

/** Conjunto de termos que identifica o produto (sem cores e ruído). */
export function productTokens(title) {
  return new Set(tokens(title).filter((t) => !NOISE.has(t) && t.length > 1).slice(0, 10));
}

function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

/**
 * Agrupa ofertas equivalentes (mesma categoria, mesmo tipo acessório/produto, títulos semelhantes).
 * Variantes que mudam o produto (pro, max, ultra, 128gb…) entram nos termos, então reduzem a semelhança.
 * @returns Map id -> clusterId
 */
export function clusterOffers(offers, threshold = 0.6) {
  const clusters = []; // { key, cat, acc, tokens, ids }
  const out = new Map();
  for (const o of offers) {
    const tk = productTokens(o.title);
    const acc = isAccessoryTitle(o.title);
    let best = null, bestSim = threshold;
    for (const c of clusters) {
      if (c.cat !== o.category || c.acc !== acc) continue;
      const sim = jaccard(tk, c.tokens);
      if (sim >= bestSim) { best = c; bestSim = sim; }
    }
    if (!best) { best = { key: 'c' + clusters.length, cat: o.category, acc, tokens: tk, ids: [] }; clusters.push(best); }
    best.ids.push(o.id);
    out.set(o.id, best.key);
  }
  return out;
}

const round = (n) => Math.round(n);

/**
 * Pontua uma oferta.
 * @param o oferta normalizada
 * @param hist resumo do histórico (summarizeHistory) ou null
 * @param peers { size, median } do grupo de equivalentes (ou null)
 */
export function scoreOffer(o, hist, peers) {
  const reasons = [];
  const flags = [];
  let score = 0;
  const claimed = o.originalPrice > o.price ? (1 - o.price / o.originalPrice) * 100 : null;

  // 1) Desconto comprovado pelo histórico
  let provenPct = null, previousPrice = null;
  if (hist && hist.count >= 2 && hist.days >= 2) {
    provenPct = (1 - o.price / hist.avg) * 100;
    previousPrice = hist.avg;
    if (provenPct >= 1) {
      score += Math.min(40, provenPct * 1.6);
      reasons.push(`Desconto comprovado: ${provenPct.toFixed(0)}% abaixo da média observada (R$ ${fmt(hist.avg)}, ${hist.count} obs. em ${hist.days} dias).`);
      if (o.price <= hist.min) { score += 5; reasons.push('Menor preço já registrado pelo Radar.'); }
    } else if (provenPct <= -3) {
      reasons.push(`Preço ${Math.abs(provenPct).toFixed(0)}% ACIMA da média observada (R$ ${fmt(hist.avg)}).`);
    } else reasons.push(`Preço dentro da média observada (R$ ${fmt(hist.avg)}).`);
  } else if (hist) {
    reasons.push(`Histórico ainda curto (${hist.count} obs. em ${hist.days} dia): desconto não comprovado.`);
  } else {
    reasons.push('Sem histórico: o desconto não pode ser comprovado ainda.');
  }

  // 2) Desconto anunciado pela loja (peso menor; checado contra o histórico)
  if (claimed != null) {
    if (hist && hist.max < o.originalPrice * 0.9) {
      flags.push(`Preço "de" R$ ${fmt(o.originalPrice)} nunca foi observado (máximo visto: R$ ${fmt(hist.max)}).`);
    } else if (!hist && claimed >= 70) {
      flags.push(`Desconto anunciado de ${claimed.toFixed(0)}% sem histórico que o comprove.`);
    } else {
      score += Math.min(18, claimed * 0.35);
      reasons.push(`Desconto anunciado pela loja: ${claimed.toFixed(0)}% (de R$ ${fmt(o.originalPrice)}).` + (claimed >= 50 ? ' Alto — confira.' : ''));
    }
  }

  // 3) Preço frente a produtos equivalentes (preço competitivo, não "desconto")
  let vsPeers = null;
  if (peers && peers.size >= 3 && peers.median) {
    vsPeers = (o.price / peers.median - 1) * 100;
    if (vsPeers <= -60) flags.push(`Preço ${Math.abs(vsPeers).toFixed(0)}% abaixo de ${peers.size} anúncios semelhantes: pode ser outro produto, peça ou anúncio irregular.`);
    else if (vsPeers <= -5) { score += Math.min(15, -vsPeers * 0.5); reasons.push(`${Math.abs(vsPeers).toFixed(0)}% mais barato que a mediana de ${peers.size} anúncios semelhantes.`); }
    else if (vsPeers >= 10) reasons.push(`${vsPeers.toFixed(0)}% mais caro que a mediana de ${peers.size} anúncios semelhantes.`);
  }

  // 4) Vendedor
  if (o.officialStore) { score += 8; reasons.push('Loja oficial.'); }
  if (o.rating != null && o.reviews >= 10) {
    if (o.rating >= 4.5) { score += 4; reasons.push(`Avaliação ${o.rating} (${o.reviews} avaliações).`); }
    else if (o.rating < 3.8) { score -= 6; reasons.push(`Avaliação baixa: ${o.rating}.`); }
  }

  // 5) Condição, frete e qualidade do anúncio
  if (o.condition === 'usado' || o.condition === 'recondicionado') { score -= 10; reasons.push(`Produto ${o.condition}.`); }
  if (o.freeShipping) { score += 7; reasons.push('Frete grátis.'); }
  if (o.image) score += 2;
  if ((o.badges || []).some((b) => /DIA|REL[AÂ]MPAGO/.test(b))) { score += 3; reasons.push('Selo do ML: ' + o.badges.join(', ') + '.'); }

  score = Math.max(0, Math.min(100, round(score)));

  // Classificação
  let label;
  const evidence = (provenPct != null && provenPct >= 3) || (claimed != null && claimed >= 20 && !flags.length) || (vsPeers != null && vsPeers <= -20);
  if (flags.length) { label = 'suspeito'; reasons.unshift(...flags); score = Math.min(score, 30); }
  // Limiares na escala real dos pontos (anúncio típico: 10–60).
  else if (provenPct != null && provenPct >= 10 && score >= 40) label = 'excelente';
  else if (evidence && score >= 12) label = 'boa';
  else label = 'regular';

  // Desconto a exibir: comprovado tem prioridade sobre o anunciado
  let discountPct = null, discountKind = null;
  if (flags.length) { /* oferta suspeita: nenhum desconto é exibido/divulgado */ }
  else if (provenPct != null && provenPct >= 1) { discountPct = provenPct; discountKind = 'comprovado'; }
  else if (claimed != null && !flags.length) { discountPct = claimed; discountKind = 'anunciado'; }

  return {
    score, label, labelText: LABELS[label], reasons,
    discountPct, discountKind,
    previousPrice: discountKind === 'comprovado' ? previousPrice : null,
    vsPeers, accessory: isAccessoryTitle(o.title)
  };
}

/**
 * Pontua todas as ofertas usando o histórico de preços e os grupos de equivalentes.
 * @param offers array de ofertas
 * @param prices histórico { id: { points } }
 */
export function scoreAll(offers, prices = {}, now = Date.now()) {
  const clusters = clusterOffers(offers);
  const byCluster = new Map();
  for (const o of offers) {
    const k = clusters.get(o.id);
    if (!byCluster.has(k)) byCluster.set(k, []);
    byCluster.get(k).push(o.price);
  }
  return offers.map((o) => {
    const k = clusters.get(o.id);
    const ps = byCluster.get(k);
    const hist = summarizeHistory(prices[o.id], now);
    return { ...o, cluster: k, peers: ps.length, ...scoreOffer(o, hist, { size: ps.length, median: median(ps) }) };
  });
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

/** Texto pronto para grupos de promoções. Só afirma o que foi comprovado. */
export function shareText(o) {
  const lines = [`🔥 ${o.title}`, ''];
  lines.push(`💰 R$ ${fmt(o.price)}` + (o.freeShipping ? ' · Frete grátis 🚚' : ''));
  if (o.discountKind === 'comprovado') {
    lines.push(`📉 ${o.discountPct.toFixed(0)}% abaixo do preço médio que acompanhamos (R$ ${fmt(o.previousPrice)})`);
  } else if (o.discountKind === 'anunciado') {
    lines.push(`🏷️ De R$ ${fmt(o.originalPrice)} por R$ ${fmt(o.price)} (${o.discountPct.toFixed(0)}% OFF anunciado pela loja)`);
  }
  if (o.seller) lines.push(`🏪 ${o.seller}${o.officialStore ? ' (loja oficial)' : ''}`);
  if (o.condition === 'usado' || o.condition === 'recondicionado') lines.push(`⚠️ Produto ${o.condition}`);
  lines.push('', `👉 ${cleanLink(o.link)}`, '', '_Preço e disponibilidade sujeitos a alteração._');
  return lines.join('\n');
}

export function fmt(n) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
