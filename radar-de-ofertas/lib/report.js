// Relatório de classificação: roda sobre as ofertas ARMAZENADAS (dados reais do usuário) e
// compara a classificação antiga (v0.5.1) com a nova (v0.6). Não usa dados inventados.

import { scoreAll, LABELS } from './scoring.js';
import { scoreAll as legacyScoreAll, LABELS as LEGACY_LABELS } from './scoring-v05.js';
import { summarizeHistory } from './analyzer.js';
import { signalCounts, signalKeys, SIGNAL_OPTIONS } from './filters.js';

function stats(nums) {
  const a = nums.slice().sort((x, y) => x - y);
  if (!a.length) return { min: null, max: null, media: null, mediana: null };
  const m = Math.floor(a.length / 2);
  return { min: a[0], max: a[a.length - 1], media: +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(1), mediana: a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2 };
}
function bands(nums) {
  const out = {};
  for (let b = 0; b < 100; b += 10) out[`${b}-${b + 9}`] = 0;
  for (const v of nums) { const b = Math.min(90, Math.floor(v / 10) * 10); out[`${b}-${b + 9}`]++; }
  return out;
}
const countBy = (list, f) => list.reduce((acc, x) => { const k = f(x); acc[k] = (acc[k] || 0) + 1; return acc; }, {});

export function classificationReport(offers, prices = {}, now = Date.now(), weights) {
  const list = Object.values(offers || {});
  const novo = scoreAll(list, prices, now, weights);
  const antigo = legacyScoreAll(list, prices, now);
  const withHist = novo.filter((o) => { const h = summarizeHistory(prices[o.id], now); return h && h.count >= 2 && h.days >= 2; });

  const penal = {
    semHistoricoDe2Dias: novo.length - withHist.length,
    semEquivalentes: novo.filter((o) => o.peers === 0).length,
    menosDe3Equivalentes: novo.filter((o) => o.peers < 3).length,
    semReferenciaDePreco: novo.filter((o) => o.attractiveness == null).length,
    descontoSoAnunciado: novo.filter((o) => o.realDiscount.level === 'anunciado').length,
    semDescontoAnunciado: novo.filter((o) => !(o.originalPrice > o.price)).length,
    descontoArtificial: novo.filter((o) => o.priceInfo.signals.includes('desconto-artificial')).length,
    precoAnomalo: novo.filter((o) => o.priceInfo.signals.includes('preco-anomalo')).length,
    acimaDoMercado: novo.filter((o) => o.priceInfo.signals.includes('acima-do-mercado')).length,
    usadoOuRecondicionado: novo.filter((o) => o.condition === 'usado' || o.condition === 'recondicionado').length,
    freteNaoInformado: novo.filter((o) => !o.freeShipping && o.shipping == null).length,
    acessorios: novo.filter((o) => o.accessory).length
  };
  const avg = (xs) => (xs.length ? +(xs.reduce((s, v) => s + v, 0) / xs.length).toFixed(1) : null);
  return {
    geradoEm: new Date(now).toISOString(),
    total: list.length,
    antigo: {
      versao: '0.5.1',
      notas: stats(antigo.map((o) => o.score)),
      faixas: bands(antigo.map((o) => o.score)),
      classes: Object.fromEntries(Object.entries(countBy(antigo, (o) => o.label)).map(([k, v]) => [LEGACY_LABELS[k] || k, v]))
    },
    novo: {
      versao: '0.6.0',
      notas: stats(novo.map((o) => o.score)),
      faixas: bands(novo.map((o) => o.score)),
      classes: Object.fromEntries(Object.keys(LABELS).map((k) => [LABELS[k], novo.filter((o) => o.label === k).length])),
      descontoReal: countBy(novo, (o) => o.realDiscount.text),
      sinaisDePreco: countBy(novo, (o) => o.priceSignalText)
    },
    penalidades: penal,
    impactoDoHistorico: {
      ofertasComHistorico: withHist.length,
      ofertasSemHistorico: novo.length - withHist.length,
      notaMediaComHistorico: avg(withHist.map((o) => o.score)),
      notaMediaSemHistorico: avg(novo.filter((o) => !withHist.includes(o)).map((o) => o.score)),
      descontosComprovados: novo.filter((o) => o.realDiscount.level === 'comprovado').length
    },
    mudancas: countBy(novo.map((o, i) => [antigo[i].label, o.label]), ([a, b]) => `${LEGACY_LABELS[a] || a} → ${LABELS[b]}`),
    filtros: filterDiagnostic(novo)
  };
}

/**
 * Diagnóstico dos filtros de sinal de preço sobre as ofertas pontuadas:
 * quantas ofertas cada opção traz, ofertas sem sinal/inválidas e a completude dos dados
 * que alimentam os sinais (preço "de", equivalentes, histórico, estratégia de leitura).
 */
export function filterDiagnostic(scored) {
  const sc = signalCounts(scored, {});
  const names = Object.fromEntries(SIGNAL_OPTIONS);
  return {
    total: sc.total,
    porSinal: Object.fromEntries(Object.entries(sc.counts).map(([k, v]) => [names[k], v])),
    sinalPrincipal: countBy(scored, (o) => names[o.priceSignal] || `inválido: ${o.priceSignal}`),
    semSinalFiltravel: scored.filter((o) => !signalKeys(o).length).length,
    sinalInvalido: sc.invalido,
    precoDe: {
      anunciadoNoCard: scored.filter((o) => o.originalPrice > o.price && o.originalPriceFrom !== 'selo-off').length,
      derivadoDoSeloOff: scored.filter((o) => o.originalPriceFrom === 'selo-off').length,
      ausente: scored.filter((o) => !(o.originalPrice > o.price)).length
    },
    comPeloMenos3Equivalentes: scored.filter((o) => o.peers >= 3).length,
    lidoPor: countBy(scored, (o) => o.parsedBy || 'não registrado (lido antes da v0.6.2)')
  };
}
