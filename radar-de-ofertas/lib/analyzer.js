// Comparação de preços e classificação de oportunidades.
// Princípio: um desconto só é tratado como real quando há HISTÓRICO observado.
// Sem histórico, o máximo que se afirma é "Boa oportunidade" em relação aos
// preços dos outros anúncios da mesma busca — e isso fica explícito no motivo.

export const LABELS = {
  excelente: 'Excelente oportunidade',
  boa: 'Boa oportunidade',
  regular: 'Preço regular',
  suspeito: 'Desconto suspeito'
};

const DAY = 24 * 60 * 60 * 1000;

export function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function pctDiff(value, ref) {
  if (!ref) return null;
  return ((value - ref) / ref) * 100;
}

// Total = preço + frete, quando o frete é conhecido.
export function totalOf(item) {
  return item.shipping == null ? item.price : item.price + item.shipping;
}

/**
 * @param {Array} items itens normalizados
 * @param {Object} history mapa id -> { points: [{t, price}] } (observações ANTERIORES)
 * @param {number} now timestamp
 */
export function analyze(items, history = {}, now = Date.now()) {
  if (!items.length) return { items: [], stats: null };
  const totals = items.map(totalOf);
  const med = median(totals);
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  // Referência "mais barato" ignora outliers (< 40% da mediana: acessórios, peças, anúncios irregulares).
  const plausible = totals.filter((t) => t >= med * 0.4);
  const refMin = plausible.length ? Math.min(...plausible) : min;

  const enriched = items.map((it) => {
    const total = totalOf(it);
    const hist = summarizeHistory(history[it.id], now);
    const verdict = classify(it, total, med, hist);
    return {
      ...it,
      total,
      shippingKnown: it.shipping != null,
      diffVsCheapest: pctDiff(total, refMin),
      isCheapest: total === refMin,
      diffVsMedian: pctDiff(total, med),
      claimedDiscount: it.originalPrice ? (1 - it.price / it.originalPrice) * 100 : null,
      history: hist,
      ...verdict
    };
  });

  enriched.sort((a, b) => a.total - b.total);
  return {
    items: enriched,
    stats: {
      count: items.length,
      min,
      max,
      refMin,
      median: med,
      spreadPct: pctDiff(max, refMin),
      shippingKnownCount: enriched.filter((i) => i.shippingKnown).length
    }
  };
}

// Resume o histórico ignorando observações da última hora (evita comparar com a própria busca repetida).
export function summarizeHistory(entry, now = Date.now()) {
  if (!entry || !entry.points || !entry.points.length) return null;
  const pts = entry.points.filter((p) => now - p.t > 60 * 60 * 1000);
  if (!pts.length) return null;
  const prices = pts.map((p) => p.price);
  const days = new Set(pts.map((p) => Math.floor(p.t / DAY))).size;
  return {
    count: pts.length,
    days,
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: prices.reduce((s, p) => s + p, 0) / prices.length,
    first: pts[0].t,
    last: pts[pts.length - 1].t
  };
}

export function classify(item, total, med, hist) {
  const reasons = [];
  const claimed = item.originalPrice ? (1 - item.price / item.originalPrice) * 100 : null;
  const vsMed = med ? pctDiff(total, med) : null;

  // --- Sinais de desconto suspeito ---
  if (claimed != null) {
    if (hist && hist.max < item.originalPrice * 0.9) {
      reasons.push(`"De" R$ ${fmt(item.originalPrice)} nunca foi observado: o maior preço registrado foi R$ ${fmt(hist.max)}.`);
      return { label: 'suspeito', labelText: LABELS.suspeito, confidence: 'média', reasons };
    }
    if (hist && item.price > hist.min * 1.05) {
      reasons.push(`Anuncia ${claimed.toFixed(0)}% OFF, mas já foi visto por R$ ${fmt(hist.min)} (mais barato que hoje).`);
      return { label: 'suspeito', labelText: LABELS.suspeito, confidence: 'média', reasons };
    }
    if (!hist && claimed >= 50) {
      reasons.push(`Desconto anunciado de ${claimed.toFixed(0)}% sem histórico que comprove o preço "de".`);
      return { label: 'suspeito', labelText: LABELS.suspeito, confidence: 'baixa', reasons };
    }
  }
  if (vsMed != null && vsMed <= -60) {
    reasons.push(`Preço ${Math.abs(vsMed).toFixed(0)}% abaixo da mediana da busca: pode ser outro produto, acessório, peça ou anúncio irregular. Verifique.`);
    return { label: 'suspeito', labelText: LABELS.suspeito, confidence: 'baixa', reasons };
  }

  // --- Com histórico próprio (evidência real) ---
  if (hist && hist.count >= 2) {
    const vsAvg = pctDiff(item.price, hist.avg);
    reasons.push(`Histórico: ${hist.count} observações em ${hist.days} dia(s); média R$ ${fmt(hist.avg)}, mínimo R$ ${fmt(hist.min)}.`);
    if (item.price <= hist.min && vsAvg <= -10) {
      reasons.push(`Menor preço já registrado, ${Math.abs(vsAvg).toFixed(0)}% abaixo da média.`);
      return { label: 'excelente', labelText: LABELS.excelente, confidence: hist.days >= 3 ? 'alta' : 'média', reasons };
    }
    if (vsAvg <= -3) {
      reasons.push(`${Math.abs(vsAvg).toFixed(0)}% abaixo da média histórica.`);
      return { label: 'boa', labelText: LABELS.boa, confidence: hist.days >= 3 ? 'alta' : 'média', reasons };
    }
    reasons.push(vsAvg > 3 ? `${vsAvg.toFixed(0)}% acima da média histórica.` : 'Dentro da faixa histórica.');
    return { label: 'regular', labelText: LABELS.regular, confidence: 'média', reasons };
  }

  // --- Sem histórico: só comparação com a busca atual ---
  reasons.push('Sem histórico suficiente deste anúncio: classificação baseada apenas nos preços da busca atual.');
  if (vsMed != null && vsMed <= -20) {
    reasons.push(`${Math.abs(vsMed).toFixed(0)}% abaixo da mediana dos resultados.`);
    return { label: 'boa', labelText: LABELS.boa, confidence: 'baixa', reasons };
  }
  if (vsMed != null) reasons.push(vsMed < 0 ? `${Math.abs(vsMed).toFixed(0)}% abaixo da mediana.` : `${vsMed.toFixed(0)}% acima da mediana.`);
  return { label: 'regular', labelText: LABELS.regular, confidence: 'baixa', reasons };
}

export function fmt(n) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
