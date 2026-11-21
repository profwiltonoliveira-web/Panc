// Inteligência de preços: atratividade do preço, INDEPENDENTE do desconto anunciado.
//
// Referências usadas (somente observadas; nenhuma é inventada):
//   - histórico do próprio anúncio (preços vistos pelo Radar em dias anteriores);
//   - anúncios EQUIVALENTES vistos (mesma marca/modelo/versão/capacidade/tamanho/quantidade/condição),
//     sem contar o próprio anúncio;
//   - preço "de" anunciado pela loja (só para checar coerência, nunca como referência de preço).
// Sem referência suficiente, a atratividade fica "sem referência" (null), não um número chutado.
//
// Sinais (distintos e explícitos):
//   desconto-comprovado   preço abaixo da média observada do próprio anúncio (≥ 2 dias)
//   desconto-anunciado    "de/por" da loja, sem contradição com o observado
//   desconto-artificial   "de" nunca observado, ou muito acima do que equivalentes custam
//   preco-excepcional     ≥ 25% abaixo da mediana de ≥ 4 equivalentes (ou bem abaixo do mínimo histórico)
//   preco-competitivo     ≥ 8% abaixo da mediana de ≥ 3 equivalentes
//   preco-anomalo         > 60% abaixo de equivalentes (provável outro produto/anúncio irregular)
//   acima-do-mercado      ≥ 15% acima da mediana de equivalentes
//   nao-confirmada        há indício (desconto anunciado/preço baixo) mas sem referência para confirmar

export const SIGNAL_TEXT = {
  'desconto-comprovado': 'Desconto comprovado',
  'desconto-anunciado': 'Desconto anunciado',
  'desconto-artificial': 'Desconto artificial',
  'preco-excepcional': 'Preço excepcionalmente baixo',
  'preco-competitivo': 'Preço competitivo',
  'preco-anomalo': 'Preço anômalo',
  'acima-do-mercado': 'Acima do mercado',
  'nao-confirmada': 'Oportunidade não confirmada',
  'regular': 'Preço na média',
  'sem-referencia': 'Sem referência de preço'
};

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const pct = (x) => `${Math.abs(x * 100).toFixed(0)}%`;

/** Estatísticas dos preços de equivalentes (exceto o próprio anúncio). */
export function peerStats(prices) {
  const a = prices.filter((n) => Number.isFinite(n) && n > 0).sort((x, y) => x - y);
  if (!a.length) return { n: 0, median: null, p25: null, min: null };
  const q = (p) => { const i = (a.length - 1) * p; const lo = Math.floor(i); return a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo); };
  return { n: a.length, median: q(0.5), p25: q(0.25), min: a[0] };
}

/**
 * @param o oferta { price, originalPrice, freeShipping, shipping, condition }
 * @param hist resumo do histórico (summarizeHistory) ou null
 * @param peers peerStats() dos equivalentes, sem o próprio anúncio
 */
export function assessPrice(o, hist, peers) {
  const signals = [];
  const reasons = [];
  const claimed = o.originalPrice > o.price ? 1 - o.price / o.originalPrice : null;
  const histOk = !!(hist && hist.count >= 2 && hist.days >= 2);
  const vsHist = histOk ? o.price / hist.avg - 1 : null;
  const vsPeers = peers && peers.n >= 3 && peers.median ? o.price / peers.median - 1 : null;
  const peerConf = peers ? clamp(peers.n / 8) : 0; // 8+ equivalentes = confiança plena

  // --- desconto anunciado: coerente ou artificial?
  let artificial = null;
  if (claimed != null) {
    if (hist && hist.max < o.originalPrice * 0.9) artificial = `preço "de" R$ ${fmt(o.originalPrice)} nunca observado (máximo visto: R$ ${fmt(hist.max)})`;
    else if (vsPeers != null && peers.n >= 3 && o.originalPrice > peers.median * 1.6 && o.price >= peers.median * 0.9)
      artificial = `preço "de" R$ ${fmt(o.originalPrice)} muito acima do que ${peers.n} equivalentes custam (mediana R$ ${fmt(peers.median)})`;
    else if (!hist && claimed >= 0.7 && vsPeers == null) artificial = `desconto anunciado de ${pct(claimed)} sem histórico nem equivalentes que o confirmem`;
  }
  if (artificial) { signals.push('desconto-artificial'); reasons.push('Desconto artificial: ' + artificial + '.'); }
  else if (claimed != null && claimed >= 0.05) { signals.push('desconto-anunciado'); reasons.push(`Desconto anunciado pela loja: ${pct(claimed)} (de R$ ${fmt(o.originalPrice)}). Não é comprovação.`); }

  // --- histórico do próprio anúncio
  if (histOk) {
    if (vsHist <= -0.03) { signals.push('desconto-comprovado'); reasons.push(`Desconto comprovado: ${pct(vsHist)} abaixo da média observada (R$ ${fmt(hist.avg)}, ${hist.count} obs. em ${hist.days} dias).`); }
    else if (vsHist >= 0.03) reasons.push(`${pct(vsHist)} ACIMA da média observada deste anúncio (R$ ${fmt(hist.avg)}).`);
    else reasons.push(`Dentro da média observada deste anúncio (R$ ${fmt(hist.avg)}).`);
    if (hist.days >= 3 && o.price < hist.min * 0.9) { signals.push('preco-excepcional'); reasons.push(`Menor preço já visto, ${pct(o.price / hist.min - 1)} abaixo do mínimo anterior.`); }
  } else if (hist) reasons.push(`Histórico curto (${hist.count} obs. em ${hist.days} dia): sem comprovação.`);

  // --- equivalentes
  if (vsPeers != null) {
    const ref = `mediana de ${peers.n} anúncios equivalentes (R$ ${fmt(peers.median)})`;
    if (vsPeers <= -0.6) { signals.push('preco-anomalo'); reasons.push(`Preço ${pct(vsPeers)} abaixo da ${ref}: provável outro produto, peça ou anúncio irregular.`); }
    else if (vsPeers <= -0.25 && peers.n >= 4) { if (!signals.includes('preco-excepcional')) signals.push('preco-excepcional'); reasons.push(`Preço excepcionalmente baixo: ${pct(vsPeers)} abaixo da ${ref}.`); }
    else if (vsPeers <= -0.08) { signals.push('preco-competitivo'); reasons.push(`Preço competitivo: ${pct(vsPeers)} abaixo da ${ref}.`); }
    else if (vsPeers >= 0.15) { signals.push('acima-do-mercado'); reasons.push(`${pct(vsPeers)} acima da ${ref}.`); }
    else reasons.push(`Na faixa da ${ref}.`);
  } else if (peers && peers.n > 0) {
    reasons.push(`Só ${peers.n} anúncio(s) equivalente(s) encontrado(s): poucos para comparar.`);
  } else reasons.push('Nenhum anúncio equivalente encontrado para comparar.');

  // --- frete e condição (afetam a confiança/leitura, não inventam preço)
  if (o.freeShipping) reasons.push('Frete grátis: o preço exibido é o preço final.');
  else if (o.shipping != null) reasons.push(`Frete de R$ ${fmt(o.shipping)}: preço final R$ ${fmt(o.price + o.shipping)}.`);
  else reasons.push('Frete não informado: o preço final pode ser maior.');
  if (o.condition === 'usado' || o.condition === 'recondicionado') reasons.push(`Produto ${o.condition}: comparado só com ${o.condition}s.`);

  // --- atratividade 0–100 (null = sem referência)
  const parts = [];
  if (vsPeers != null && !signals.includes('preco-anomalo')) parts.push({ v: clamp(0.5 - vsPeers / 0.5), w: peerConf });            // −25% → 1,0 · 0% → 0,5 · +25% → 0
  if (histOk) parts.push({ v: clamp(0.5 - vsHist / 0.4), w: clamp(hist.days / 5) });                                                    // −20% → 1,0
  let attractiveness = null, confidence = 'nenhuma';
  const wsum = parts.reduce((s, p) => s + p.w, 0);
  if (wsum > 0) {
    attractiveness = (parts.reduce((s, p) => s + p.v * p.w, 0) / wsum) * 100;
    if (!o.freeShipping && o.shipping == null) attractiveness *= 0.95; // frete desconhecido: leve desconto de confiança
    attractiveness = Math.round(attractiveness);
    confidence = wsum >= 1.2 ? 'alta' : wsum >= 0.6 ? 'média' : 'baixa';
  }

  // --- "não confirmada": há indício, mas nada para confirmar
  const hasIndication = signals.includes('desconto-anunciado');
  if (hasIndication && !histOk && vsPeers == null) signals.push('nao-confirmada');

  const order = ['preco-anomalo', 'desconto-artificial', 'desconto-comprovado', 'preco-excepcional', 'preco-competitivo', 'nao-confirmada', 'desconto-anunciado', 'acima-do-mercado'];
  const primary = order.find((s) => signals.includes(s)) || (attractiveness == null ? 'sem-referencia' : 'regular');

  return {
    attractiveness, confidence, signals, primary, primaryText: SIGNAL_TEXT[primary], reasons,
    claimedPct: claimed != null ? claimed * 100 : null,
    provenPct: histOk && vsHist < 0 ? -vsHist * 100 : null,
    vsPeersPct: vsPeers != null ? vsPeers * 100 : null,
    peers: peers ? { n: peers.n, median: peers.median } : { n: 0, median: null },
    histAvg: histOk ? hist.avg : null
  };
}

export function fmt(n) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------- v0.6: indicador A — DESCONTO REAL (evidências de redução de preço) ----------
// Níveis, do mais forte ao mais fraco (cada um com evidência explícita; nada é inventado):
//   comprovado   preço ≥ 3% abaixo da média OBSERVADA do próprio anúncio (histórico ≥ 2 dias)
//   corroborado  há "de/por" e o preço "de" é compatível com o que ≥ 3 anúncios EQUIVALENTES
//                cobram (≤ 125% da mediana), e o preço atual está ≥ 5% abaixo dessa mediana
//   campanha     "de/por" ≥ 15% numa página OFICIAL de ofertas do ML, com selo do ML (oferta do dia/
//                relâmpago) ou loja oficial — evidência da plataforma, não verificada pelo Radar
//   anunciado    só o "de/por" do vendedor (sem confirmação)
//   artificial   "de" contraditório (nunca observado / muito acima dos equivalentes)
export const DISCOUNT_TEXT = {
  comprovado: 'Desconto comprovado',
  corroborado: 'Desconto confirmado por equivalentes',
  campanha: 'Desconto em campanha oficial do ML',
  anunciado: 'Desconto só anunciado',
  artificial: 'Desconto artificial',
  nenhum: 'Sem desconto'
};

/**
 * @param o oferta (price, originalPrice, badges, officialStore, sources)
 * @param pa resultado de assessPrice (sinais e comparações)
 * @param peers peerStats dos equivalentes
 */
export function assessDiscount(o, pa, peers) {
  const claimed = pa.claimedPct; // %
  if (pa.signals.includes('desconto-artificial')) return { level: 'artificial', text: DISCOUNT_TEXT.artificial, pct: null, value: 0, evidence: 'preço "de" contraditório' };
  if (pa.provenPct != null && pa.signals.includes('desconto-comprovado')) {
    return { level: 'comprovado', text: DISCOUNT_TEXT.comprovado, pct: pa.provenPct, value: Math.round(50 + Math.min(50, pa.provenPct * 2.5)), evidence: `média observada R$ ${fmt(pa.histAvg)}` };
  }
  if (claimed != null && claimed >= 10 && peers && peers.n >= 3 && peers.median && o.originalPrice <= peers.median * 1.25 && o.price <= peers.median * 0.95) {
    const pct = Math.min(claimed, (1 - o.price / peers.median) * 100);
    return { level: 'corroborado', text: DISCOUNT_TEXT.corroborado, pct, value: Math.round(35 + Math.min(40, pct * 1.6)), evidence: `${peers.n} equivalentes custam R$ ${fmt(peers.median)} (mediana)` };
  }
  const officialSource = (o.sources || []).some((s) => /^(ofertas|cat-)/.test(s));
  const mlBadge = (o.badges || []).some((b) => /DIA|REL[AÂ]MPAGO/.test(b));
  if (claimed != null && claimed >= 15 && officialSource && (mlBadge || o.officialStore) && !pa.signals.includes('acima-do-mercado')) {
    return { level: 'campanha', text: DISCOUNT_TEXT.campanha, pct: claimed, value: Math.round(20 + Math.min(30, claimed * 0.6)), evidence: mlBadge ? 'selo do ML na página oficial de ofertas' : 'loja oficial na página oficial de ofertas' };
  }
  if (claimed != null && claimed >= 5) return { level: 'anunciado', text: DISCOUNT_TEXT.anunciado, pct: claimed, value: Math.round(Math.min(20, claimed * 0.4)), evidence: 'só o vendedor informa' };
  return { level: 'nenhum', text: DISCOUNT_TEXT.nenhum, pct: null, value: 0, evidence: null };
}
