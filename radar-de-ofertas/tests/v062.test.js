// Testes v0.6.2 — filtros do painel. Dados SINTÉTICOS (ilustrativos), não anúncios reais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAll } from '../lib/scoring.js';
import { applyOfferFilters, signalCounts, signalKeys, normKey, SIGNAL_KEYS, sortOffers } from '../lib/filters.js';
import { filterDiagnostic } from '../lib/report.js';
import '../lib/ml-parser.js';
const RML = globalThis.RadarML;

const DAY = 86400000, NOW = Date.UTC(2026, 10, 24, 12);
let n = 1;
const mk = (title, price, extra = {}) => ({ id: 'MLB' + (3000000000 + n++), title, price, originalPrice: null, freeShipping: true, image: '', link: 'https://produto.mercadolivre.com.br/MLB-1-x-_JM', category: 'eletronicos', sources: ['ofertas'], firstSeen: NOW, lastSeen: NOW, ...extra });

// Conjunto que produz TODOS os sinais
function dataset() {
  const offers = [], prices = {};
  for (const p of [399, 410, 389, 420, 405]) offers.push(mk('Air Fryer Mondial AF-30 4L', p));
  offers.push(mk('Air Fryer Mondial AF-30 4L', 259));                         // excepcional
  offers.push(mk('Air Fryer Mondial AF-30 4L', 360));                         // competitivo
  offers.push(mk('Air Fryer Mondial AF-30 4L', 499));                         // acima do mercado
  offers.push(mk('Air Fryer Mondial AF-30 4L', 120));                         // anômalo
  const tv = mk('Smart TV LG 55UR8750', 2399); offers.push(tv);               // comprovado
  prices[tv.id] = { points: [{ t: NOW - 5 * DAY, price: 2899 }, { t: NOW - 3 * DAY, price: 2950 }, { t: NOW - 2 * DAY, price: 2850 }] };
  offers.push(mk('Produto Raro XZ-9', 100, { originalPrice: 150 }));          // anunciado + não confirmada
  offers.push(mk('Perfume Raro X', 60, { originalPrice: 300 }));             // artificial
  offers.push(mk('Ventilador Sem Par VX-1', 199));                            // sem referência
  offers.push(mk('Fone Usado XYZ-7', 80, { condition: 'usado' }));            // sem referência, usado
  return { offers, prices, scored: scoreAll(offers, prices, NOW) };
}

test('toda oferta tem pelo menos um sinal filtrável (nenhuma "some" dos filtros)', () => {
  const { scored } = dataset();
  for (const o of scored) assert.ok(signalKeys(o).length >= 1, o.title);
  const covered = new Set();
  for (const k of SIGNAL_KEYS) applyOfferFilters(scored, { signal: k }).forEach((o) => covered.add(o.id));
  assert.equal(covered.size, scored.length, 'a união das opções cobre todas as ofertas');
});

test('"Qualquer sinal de preço" mostra todas as ofertas', () => {
  const { scored } = dataset();
  assert.equal(applyOfferFilters(scored, { signal: '' }).length, scored.length);
  assert.equal(applyOfferFilters(scored, {}).length, scored.length);
});

test('cada opção retorna exatamente as ofertas com aquele sinal', () => {
  const { scored } = dataset();
  const by = (k) => applyOfferFilters(scored, { signal: k }).map((o) => o.title + ' ' + o.price).sort();
  assert.deepEqual(by('desconto-comprovado'), ['Smart TV LG 55UR8750 2399']);
  // a TV (desconto comprovado) também está ≥ 10% abaixo do menor preço já visto → excepcional (sinal múltiplo)
  assert.deepEqual(by('preco-excepcional'), ['Air Fryer Mondial AF-30 4L 259', 'Smart TV LG 55UR8750 2399']);
  assert.ok(by('preco-competitivo').includes('Air Fryer Mondial AF-30 4L 360'));
  assert.deepEqual(by('desconto-anunciado'), ['Produto Raro XZ-9 100']);
  assert.deepEqual(by('nao-confirmada'), ['Produto Raro XZ-9 100']);
  assert.deepEqual(by('desconto-artificial'), ['Perfume Raro X 60']);
  assert.deepEqual(by('preco-anomalo'), ['Air Fryer Mondial AF-30 4L 120']);
  assert.ok(by('acima-do-mercado').includes('Air Fryer Mondial AF-30 4L 499'));
  assert.ok(by('sem-referencia').includes('Ventilador Sem Par VX-1 199'));
  assert.ok(by('regular').length >= 1);
  for (const k of SIGNAL_KEYS) assert.ok(by(k).length >= 1, `opção ${k} não pode ficar vazia neste conjunto`);
});

test('a mesma oferta aparece em todos os seus sinais (classificação múltipla), não em outros', () => {
  const { scored } = dataset();
  const raro = scored.find((o) => o.title === 'Produto Raro XZ-9');
  const ks = signalKeys(raro);
  assert.ok(ks.includes('desconto-anunciado') && ks.includes('nao-confirmada'));
  for (const k of SIGNAL_KEYS) assert.equal(applyOfferFilters([raro], { signal: k }).length, ks.includes(k) ? 1 : 0, k);
});

test('a contagem exibida em cada opção = número de resultados do filtro', () => {
  const { scored } = dataset();
  for (const f of [{}, { free: true }, { min: 200 }, { label: 'competitivo' }, { cond: 'usado' }]) {
    const { total, counts } = signalCounts(scored, f);
    assert.equal(total, applyOfferFilters(scored, f).length);
    for (const k of SIGNAL_KEYS) assert.equal(counts[k], applyOfferFilters(scored, { ...f, signal: k }).length, `${JSON.stringify(f)} ${k}`);
  }
});

test('filtros combinados (sinal + preço + classe + condição + texto + categoria + acessório)', () => {
  const { scored } = dataset();
  assert.equal(applyOfferFilters(scored, { signal: 'preco-competitivo', max: 300 }).length, 0);
  assert.equal(applyOfferFilters(scored, { signal: 'preco-excepcional', label: 'boa' }).length, 2);
  assert.equal(applyOfferFilters(scored, { signal: 'preco-excepcional', label: 'boa', max: 1000 }).length, 1);
  assert.equal(applyOfferFilters(scored, { signal: 'sem-referencia', cond: 'usado' }).length, 1);
  assert.equal(applyOfferFilters(scored, { signal: 'sem-referencia', cond: 'novo', text: 'ventilador' }).length, 1);
  assert.equal(applyOfferFilters(scored, { signal: 'desconto-comprovado', proven: true }).length, 1);
  assert.equal(applyOfferFilters(scored, { signal: 'desconto-comprovado', category: 'moda' }).length, 0);
  assert.equal(applyOfferFilters(scored, { group: 'eletronicos', groupOf: () => 'eletronicos', signal: 'preco-anomalo' }).length, 1);
  assert.equal(applyOfferFilters(scored, { disc: 30, signal: 'desconto-anunciado' }).length, 1);
  assert.equal(applyOfferFilters(scored, { label: 'suspeito' }).length, 2);
});

test('normalização, nulos e valores inválidos', () => {
  assert.equal(normKey('Preço Competitivo'), 'preco-competitivo');
  assert.equal(normKey('preco_competitivo'), 'preco-competitivo');
  assert.equal(normKey(null), '');
  const { scored } = dataset();
  assert.equal(applyOfferFilters(scored, { signal: 'Preço excepcionalmente baixo' }).length, 2); // rótulo visual → chave
  assert.equal(applyOfferFilters(scored, { signal: 'Sem referência de preço' }).length, applyOfferFilters(scored, { signal: 'sem-referencia' }).length);
  assert.equal(applyOfferFilters(scored, { signal: 'sinal-que-nao-existe' }).length, 0);
  assert.equal(applyOfferFilters(scored, { signal: 'PRECO-EXCEPCIONAL' }).length, 2);  // chave normalizada
  // oferta sem priceInfo (ex.: dado antigo/corrompido) não quebra; aparece em "qualquer"
  const bad = { id: 'x', title: 'x', price: 10 };
  assert.deepEqual(signalKeys(bad), []);
  assert.equal(applyOfferFilters([bad], {}).length, 1);
  assert.equal(signalCounts([bad], {}).semSinal, 1);
});

test('filtros recalculam após nova varredura (novos dados → novos sinais)', () => {
  const { offers, prices } = dataset();
  const before = signalCounts(scoreAll(offers, prices, NOW), {}).counts['desconto-comprovado'];
  const air = offers.find((o) => o.price === 405);
  prices[air.id] = { points: [{ t: NOW - 4 * DAY, price: 520 }, { t: NOW - 2 * DAY, price: 515 }] };
  const after = signalCounts(scoreAll(offers, prices, NOW), {}).counts['desconto-comprovado'];
  assert.equal(after, before + 1);
});

test('ordenação preserva todos os itens', () => {
  const { scored } = dataset();
  for (const s of ['score', 'discount', 'price', 'new']) assert.equal(sortOffers(scored, s).length, scored.length);
});

test('diagnóstico dos filtros (relatório): cobertura e completude dos dados', () => {
  const { scored } = dataset();
  const d = filterDiagnostic(scored);
  assert.equal(d.total, scored.length);
  assert.equal(d.semSinalFiltravel, 0);
  assert.equal(d.sinalInvalido, 0);
  assert.equal(d.precoDe.anunciadoNoCard, 2);
  assert.equal(d.precoDe.ausente, scored.length - 2);
  assert.ok(!Object.keys(d.sinalPrincipal).some((k) => k.startsWith('inválido')));
});

// ---- extração do preço "de" (causa provável dos zeros com dados reais) ----
test('polycard: preço "de" em chaves alternativas e pelo selo "% OFF"', () => {
  const base = (price) => ({ metadata: { id: 'MLB5123456789', url: 'produto.mercadolivre.com.br/MLB-5123456789-x-_JM' }, components: [{ type: 'title', title: { text: 'Air Fryer Mondial AF-30' } }, price] });
  const a = RML.polycardToItem(base({ type: 'price', price: { current_price: { value: 300 }, original_price: { value: 450 } } }));
  assert.equal(a.originalPrice, 450); assert.equal(a.originalPriceFrom, 'anuncio'); assert.equal(a.parsedBy, 'json');
  const b = RML.polycardToItem(base({ type: 'price', price: { current_price: { value: 300 }, discount_label: { text: '40% OFF' } } }));
  assert.equal(b.originalPrice, 500); assert.equal(b.originalPriceFrom, 'selo-off');
  const c = RML.polycardToItem(base({ type: 'price', price: { current_price: { value: 300 } } }));
  assert.equal(c.originalPrice, null); assert.equal(c.originalPriceFrom, null);
});
