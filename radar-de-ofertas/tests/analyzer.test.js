import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, classify, median, summarizeHistory } from '../lib/analyzer.js';
import { idFromUrl, parseBRL, normalizeApiItem } from '../lib/mercadolivre.js';

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 20);
const item = (id, price, extra = {}) => ({ id, title: id, price, originalPrice: null, shipping: null, freeShipping: false, ...extra });

test('median', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});

test('ordena por total (preço + frete conhecido) e calcula diferenças', () => {
  const r = analyze([item('a', 100, { shipping: 30 }), item('b', 110, { shipping: 0, freeShipping: true }), item('c', 120)], {}, NOW);
  assert.deepEqual(r.items.map((i) => i.id), ['b', 'c', 'a']);
  assert.equal(r.items[0].diffVsCheapest, 0);
  assert.ok(Math.abs(r.items[2].diffVsCheapest - 18.18) < 0.01);
  assert.equal(r.stats.median, 120);
});

test('sem histórico nunca vira "excelente"', () => {
  const r = analyze([item('a', 50), item('b', 100), item('c', 100), item('d', 100)], {}, NOW);
  const a = r.items.find((i) => i.id === 'a');
  assert.equal(a.label, 'boa');
  assert.equal(a.confidence, 'baixa');
});

test('desconto grande sem histórico é suspeito', () => {
  const v = classify(item('a', 100, { originalPrice: 300 }), 100, 100, null);
  assert.equal(v.label, 'suspeito');
});

test('preço "de" nunca observado no histórico é suspeito', () => {
  const hist = { count: 3, days: 3, min: 95, max: 105, avg: 100 };
  const v = classify(item('a', 90, { originalPrice: 180 }), 90, 100, hist);
  assert.equal(v.label, 'suspeito');
});

test('menor preço já registrado e bem abaixo da média é excelente', () => {
  const history = { a: { points: [{ t: NOW - 5 * DAY, price: 200 }, { t: NOW - 3 * DAY, price: 190 }, { t: NOW - DAY, price: 195 }] } };
  const r = analyze([item('a', 150), item('b', 160), item('c', 170)], history, NOW);
  const a = r.items.find((i) => i.id === 'a');
  assert.equal(a.label, 'excelente');
  assert.equal(a.confidence, 'alta');
});

test('preço acima da média histórica é regular', () => {
  const history = { a: { points: [{ t: NOW - 2 * DAY, price: 100 }, { t: NOW - DAY, price: 100 }] } };
  const r = analyze([item('a', 110), item('b', 110)], history, NOW);
  assert.equal(r.items.find((i) => i.id === 'a').label, 'regular');
});

test('preço absurdamente abaixo da mediana é suspeito', () => {
  const r = analyze([item('a', 20), item('b', 100), item('c', 110), item('d', 105)], {}, NOW);
  assert.equal(r.items.find((i) => i.id === 'a').label, 'suspeito');
});

test('histórico ignora observações da última hora', () => {
  assert.equal(summarizeHistory({ points: [{ t: NOW - 1000, price: 1 }] }, NOW), null);
});

test('utilitários do Mercado Livre', () => {
  assert.equal(parseBRL('1.299,90'), 1299.9);
  assert.equal(idFromUrl('https://produto.mercadolivre.com.br/MLB-1234567890-fone-_JM'), 'MLB1234567890');
  assert.equal(idFromUrl('https://www.mercadolivre.com.br/fone/p/MLB123456789?wid=MLB998877665#x'), 'MLB998877665');
  const n = normalizeApiItem({ id: 'MLB1', title: 'X', price: 10, original_price: 20, permalink: 'https://produto.mercadolivre.com.br/MLB-1', thumbnail: 'http://http2.mlstatic.com/D_1-I.jpg', shipping: { free_shipping: true }, condition: 'new' });
  assert.equal(n.shipping, 0);
  assert.equal(n.originalPrice, 20);
  assert.equal(n.image, 'https://http2.mlstatic.com/D_1-O.jpg');
  assert.equal(normalizeApiItem({ price: 10, permalink: 'https://evil.com/x' }), null);
});
