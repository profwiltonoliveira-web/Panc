// Comparação de preços e classificação de oportunidades.
//
// Princípios:
//  1. Um desconto só é tratado como real quando há HISTÓRICO observado pela extensão.
//     Sem histórico, o máximo é "Boa oportunidade" (confiança baixa), com o motivo explícito.
//  2. Só se comparam anúncios EQUIVALENTES: mesmo produto/variante/condição.
//     Acessórios, variantes (Pro, Max, 128 GB vs 256 GB…) e itens que não contêm os
//     termos da busca não entram na mediana nem no "mais barato" de outros grupos.

export const LABELS = {
  excelente: 'Excelente oportunidade',
  boa: 'Boa oportunidade',
  regular: 'Preço regular',
  suspeito: 'Desconto suspeito'
};

const DAY = 24 * 60 * 60 * 1000;
const MIN_GROUP = 3; // mínimo de anúncios equivalentes para comparar com a mediana

const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'pra', 'o', 'a', 'os', 'as', 'em', 'no', 'na', 'original', 'novo', 'nova', 'lacrado', 'promocao', 'oferta']);
// Palavras que, presentes no título mas ausentes da busca, indicam outro tipo de produto.
// Só contam quando aparecem ANTES do produto no título ("Capa para iPhone 13"), pois títulos
// costumam listar itens inclusos ("Fone com cabo e carregador").
const ACCESSORY = new Set(['capa', 'capinha', 'case', 'pelicula', 'suporte', 'carregador', 'cabo', 'adaptador', 'protetor', 'bolsa', 'estojo', 'refil', 'peca', 'pecas', 'tela', 'display', 'bateria', 'controle', 'almofada', 'almofadas', 'espuma', 'ponteira', 'ponteiras', 'borracha', 'adesivo', 'skin', 'reposicao', 'kit']);
// Indicam produto genérico/compatível em qualquer posição.
const NOT_GENUINE = new Set(['compativel', 'replica', 'similar', 'paralelo']);
// Variantes que mudam o produto (comparadas pela presença no título).
const VARIANT = new Set(['pro', 'max', 'plus', 'mini', 'ultra', 'lite', 'fe', 'slim', 'air', 'xl', 'xr', 'xs', 'promax']);

export function tokens(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/(\d)\s+(gb|tb|mb|mah|w|pol|polegadas|ml|l|kg|g)\b/g, '$1$2')
    .split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Verifica se o título corresponde à busca e calcula a chave de grupo de equivalência.
 * @returns {{ equivalent: boolean, group: string, why: string|null }}
 */
export function matchProduct(query, title, condition) {
  const q = tokens(query).filter((t) => !STOPWORDS.has(t));
  const tt = tokens(title);
  const tset = new Set(tt);
  const joined = tt.join('');
  const qset = new Set(q);

  const has = (t) =>
    tset.has(t) || tset.has(t + 's') || (t.endsWith('s') && tset.has(t.slice(0, -1))) ||
    // "50" na busca vs "50polegadas"/"128gb" no título (número seguido de unidade)
    (/^\d+$/.test(t) && tt.some((x) => new RegExp('^' + t + '(gb|tb|mb|mah|w|pol|polegadas|ml|l|kg|g)$').test(x))) ||
    // "520bt" na busca vs "520 bt" no título: só para termos que misturam letras e números
    (/[a-z]/.test(t) && /\d/.test(t) && t.length >= 4 && joined.includes(t));
  const missing = q.filter((t) => !has(t));
  if (missing.length) return { equivalent: false, group: null, why: `Título não contém "${missing.join('", "')}" da busca.` };

  const firstQ = q.length ? Math.min(...q.map((t) => tt.findIndex((x) => x === t || x === t + 's' || x + 's' === t)).filter((i) => i >= 0)) : Infinity;
  const accIdx = tt.findIndex((t, i) => i < firstQ && ACCESSORY.has(t) && !qset.has(t));
  if (accIdx >= 0) return { equivalent: false, group: null, why: `Parece acessório/peça ("${tt[accIdx]}"), não o produto buscado.` };
  const ng = tt.find((t) => NOT_GENUINE.has(t) && !qset.has(t));
  if (ng) return { equivalent: false, group: null, why: `Título indica produto "${ng}", não o original buscado.` };

  // Chave do grupo: variantes e capacidades presentes no título mas não fixadas pela busca, + condição.
  const variant = tt.filter((t) => VARIANT.has(t) && !qset.has(t));
  const capacity = tt.filter((t) => /^\d+(gb|tb)$/.test(t) && !qset.has(t));
  const parts = [...new Set([...variant, ...capacity])].sort();
  if (condition === 'usado' || condition === 'recondicionado') parts.push(condition);
  return { equivalent: true, group: parts.join(' ') || 'padrão', why: null };
}

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
 * @param {string} query termo buscado (para checar equivalência)
 */
export function analyze(items, history = {}, now = Date.now(), query = '') {
  if (!items.length) return { items: [], stats: null, groups: [] };

  const base = items.map((it) => {
    const m = query ? matchProduct(query, it.title, it.condition) : { equivalent: true, group: 'padrão', why: null };
    return { ...it, total: totalOf(it), equivalent: m.equivalent, group: m.group, matchWhy: m.why };
  });

  // Estatísticas por grupo de equivalência
  const groups = new Map();
  for (const it of base) {
    if (!it.equivalent) continue;
    if (!groups.has(it.group)) groups.set(it.group, []);
    groups.get(it.group).push(it.total);
  }
  const gstats = new Map();
  for (const [g, totals] of groups) {
    const med = median(totals);
    const plausible = totals.filter((t) => t >= med * 0.4); // ignora outliers muito baratos
    gstats.set(g, { group: g, count: totals.length, median: med, refMin: Math.min(...plausible), max: Math.max(...totals) });
  }

  const enriched = base.map((it) => {
    const gs = it.equivalent ? gstats.get(it.group) : null;
    const comparable = !!gs && gs.count >= MIN_GROUP;
    const hist = summarizeHistory(history[it.id], now);
    const verdict = classify(it, it.total, comparable ? gs.median : null, hist, it.equivalent ? null : it.matchWhy);
    return {
      ...it,
      shippingKnown: it.shipping != null,
      groupSize: gs ? gs.count : 0,
      diffVsCheapest: gs ? pctDiff(it.total, gs.refMin) : null,
      isCheapest: !!gs && gs.count > 1 && it.total === gs.refMin,
      diffVsMedian: comparable ? pctDiff(it.total, gs.median) : null,
      claimedDiscount: it.originalPrice ? (1 - it.price / it.originalPrice) * 100 : null,
      history: hist,
      ...verdict
    };
  });

  enriched.sort((a, b) => (b.equivalent - a.equivalent) || a.total - b.total);

  // Grupo principal = maior grupo de equivalentes (usado no resumo)
  const main = [...gstats.values()].sort((a, b) => b.count - a.count)[0] || null;
  const eqCount = enriched.filter((i) => i.equivalent).length;
  return {
    items: enriched,
    groups: [...gstats.values()],
    stats: {
      count: items.length,
      equivalentCount: eqCount,
      mainGroup: main ? main.group : null,
      mainGroupCount: main ? main.count : 0,
      refMin: main ? main.refMin : null,
      median: main ? main.median : null,
      max: main ? main.max : null,
      spreadPct: main ? pctDiff(main.max, main.refMin) : null,
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

/**
 * @param med mediana do grupo de equivalentes (null se não houver comparáveis suficientes)
 * @param notEquivalentWhy motivo, se o anúncio não for equivalente à busca
 */
export function classify(item, total, med, hist, notEquivalentWhy = null) {
  const reasons = [];
  const claimed = item.originalPrice ? (1 - item.price / item.originalPrice) * 100 : null;
  const vsMed = med ? pctDiff(total, med) : null;
  const histConf = (h) => (h.days >= 3 ? 'alta' : h.days >= 2 ? 'média' : 'baixa');

  if (notEquivalentWhy) reasons.push(notEquivalentWhy + ' Não comparado com os demais.');

  // --- Desconto anunciado sem respaldo ---
  if (claimed != null) {
    if (hist && hist.max < item.originalPrice * 0.9) {
      reasons.push(`Preço "de" R$ ${fmt(item.originalPrice)} nunca foi observado: o maior preço registrado foi R$ ${fmt(hist.max)} (${hist.count} obs. em ${hist.days} dia(s)).`);
      return verdict('suspeito', histConf(hist), reasons);
    }
    if (!hist && claimed >= 50) {
      reasons.push(`Desconto anunciado de ${claimed.toFixed(0)}% sem histórico que comprove o preço "de".`);
      return verdict('suspeito', 'baixa', reasons);
    }
  }
  if (vsMed != null && vsMed <= -60) {
    reasons.push(`Preço ${Math.abs(vsMed).toFixed(0)}% abaixo da mediana de anúncios equivalentes: pode ser outro produto, peça ou anúncio irregular. Verifique.`);
    return verdict('suspeito', 'baixa', reasons);
  }

  // --- Com histórico próprio (evidência real) ---
  if (hist && hist.count >= 2) {
    const vsAvg = pctDiff(item.price, hist.avg);
    reasons.push(`Histórico: ${hist.count} observações em ${hist.days} dia(s); média R$ ${fmt(hist.avg)}, mínimo R$ ${fmt(hist.min)}, máximo R$ ${fmt(hist.max)}.`);
    if (item.price <= hist.min && vsAvg <= -10) {
      reasons.push(`Menor preço já registrado, ${Math.abs(vsAvg).toFixed(0)}% abaixo da média.`);
      return verdict('excelente', histConf(hist), reasons);
    }
    if (vsAvg <= -3) {
      reasons.push(`${Math.abs(vsAvg).toFixed(0)}% abaixo da média histórica.`);
      return verdict('boa', histConf(hist), reasons);
    }
    if (claimed != null && item.price > hist.min * 1.05) {
      reasons.push(`Anuncia ${claimed.toFixed(0)}% OFF, mas já foi visto por R$ ${fmt(hist.min)}.`);
    }
    reasons.push(vsAvg > 3 ? `${vsAvg.toFixed(0)}% acima da média histórica.` : 'Dentro da faixa histórica.');
    return verdict('regular', histConf(hist), reasons);
  }

  // --- Sem histórico: só comparação com anúncios equivalentes da busca atual ---
  reasons.push('Sem histórico suficiente deste anúncio: nada comprova que o desconto seja real.');
  if (vsMed == null) {
    if (!notEquivalentWhy) reasons.push(`Menos de ${MIN_GROUP} anúncios equivalentes na busca para comparar.`);
    return verdict('regular', 'baixa', reasons);
  }
  if (vsMed <= -20) {
    reasons.push(`${Math.abs(vsMed).toFixed(0)}% abaixo da mediana de anúncios equivalentes.`);
    return verdict('boa', 'baixa', reasons);
  }
  reasons.push(vsMed < 0 ? `${Math.abs(vsMed).toFixed(0)}% abaixo da mediana de equivalentes.` : `${vsMed.toFixed(0)}% acima da mediana de equivalentes.`);
  return verdict('regular', 'baixa', reasons);
}

function verdict(label, confidence, reasons) {
  return { label, labelText: LABELS[label], confidence, reasons };
}

export function fmt(n) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
