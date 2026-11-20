import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, classify, median, summarizeHistory, matchProduct } from '../lib/analyzer.js';
import { idFromUrl, parseBRL, normalizeApiItem, safeLink, safeImage, slugify } from '../lib/mercadolivre.js';
import { prune } from '../lib/storage.js';

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

test('desconto grande sem histórico é suspeito (confiança baixa)', () => {
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

// ---------- auditoria ----------
test('idFromUrl ignora IDs de categoria/vitrine em parâmetros (caso real da home do ML)', () => {
  assert.equal(idFromUrl('https://www.mercadolivre.com.br/ofertas?price=0.0-100.0&container_id=MLB779362-1#da_id=x'), null);
  assert.equal(idFromUrl('https://www.mercadolivre.com.br/c/ferramentas#c_id=/home&c_category_id=MLB263532'), null);
  assert.equal(idFromUrl('https://produto.mercadolivre.com.br/MLB-1234567890-fone-_JM?searchVariation=MLB999999999'), 'MLB1234567890');
  assert.equal(idFromUrl('https://www.mercadolivre.com.br/fone/p/MLB19865372'), 'P:MLB19865372');
  assert.equal(idFromUrl('https://www.mercadolivre.com.br/fone/p/MLB19865372?item_id=MLB3456789012'), 'MLB3456789012');
  assert.equal(idFromUrl('https://www.mercadolivre.com.br/x/up/MLBU1234567'), 'U:MLBU1234567');
});

test('safeLink aceita só https em domínios do Mercado Livre', () => {
  assert.ok(safeLink('https://produto.mercadolivre.com.br/MLB-1'));
  assert.ok(safeLink('/fone/p/MLB123456'));
  assert.equal(safeLink('https://mercadolivre.com.br.evil.com/x'), null);
  assert.equal(safeLink('https://evilmercadolivre.com.br/x'), null);
  assert.equal(safeLink('http://produto.mercadolivre.com.br/MLB-1'), null);
  assert.equal(safeLink('javascript:alert(1)'), null);
});

test('safeImage aceita só o CDN mlstatic.com', () => {
  assert.equal(safeImage('https://tracker.example.com/p.gif'), '');
  assert.equal(safeImage('https://http2.mlstatic.com.evil.com/a.jpg'), '');
  assert.equal(safeImage('data:image/gif;base64,AAA'), '');
  assert.equal(safeImage('https://http2.mlstatic.com/D_NQ_1-O.webp'), 'https://http2.mlstatic.com/D_NQ_1-O.webp');
});

test('slugify', () => {
  assert.equal(slugify('Fone Bluetooth JBL Tune 520BT!'), 'fone-bluetooth-jbl-tune-520bt');
  assert.equal(slugify('Câmera ação'), 'camera-acao');
  assert.equal(slugify('!!!'), '');
});

test('equivalência: acessórios e variantes não são tratados como o mesmo produto', () => {
  const q = 'iphone 13';
  assert.equal(matchProduct(q, 'Capa Capinha Para iPhone 13 Silicone').equivalent, false);
  assert.equal(matchProduct(q, 'Película De Vidro 3d iPhone 13').equivalent, false);
  assert.equal(matchProduct(q, 'Tela Display Frontal iPhone 13 Compatível').equivalent, false);
  assert.equal(matchProduct(q, 'Apple iPhone 12 (128 GB) - Preto').equivalent, false);
  const a = matchProduct(q, 'Apple iPhone 13 (128 GB) - Meia-noite');
  const b = matchProduct(q, 'Apple iPhone 13 (256 GB) - Estelar');
  const c = matchProduct(q, 'Apple iPhone 13 Pro Max 128 GB');
  const d = matchProduct(q, 'Apple iPhone 13 128gb Azul', 'usado');
  assert.ok(a.equivalent && b.equivalent && c.equivalent && d.equivalent);
  assert.notEqual(a.group, b.group); // capacidades diferentes
  assert.notEqual(a.group, c.group); // variante Pro Max
  assert.notEqual(a.group, d.group); // usado
  assert.equal(matchProduct('iphone 13 128gb', 'Apple iPhone 13 (128 GB) - Rosa').group, 'padrão');
});

test('equivalência: sem falsos "produto diferente" em títulos comuns', () => {
  assert.equal(matchProduct('fone jbl tune 520bt', 'Fones De Ouvido Jbl Tune 520 Bt Bluetooth Preto').equivalent, true);
  assert.equal(matchProduct('caixa de som jbl flip 6', 'Caixa De Som Jbl Flip 6 Bluetooth').equivalent, true);
  assert.equal(matchProduct('smart tv 50', 'Smart Tv 50 Polegadas 4k Com Controle Remoto').equivalent, true);
  assert.equal(matchProduct('fone jbl', 'Fone Jbl Com Cabo E Carregador').equivalent, true);
  assert.equal(matchProduct('iphone 15', 'Apple iPhone 13 150 Fotos').equivalent, false); // "15" não casa com "150"
});

test('equivalência: comparação só dentro do grupo (sem "boa oportunidade" falsa por mistura de variantes)', () => {
  const items = [
    item('a', 3000, { title: 'Apple iPhone 13 128 GB' }),
    item('b', 3100, { title: 'Apple iPhone 13 128 GB Azul' }),
    item('c', 3050, { title: 'Apple iPhone 13 128 GB Rosa' }),
    item('d', 5000, { title: 'Apple iPhone 13 Pro Max 256 GB' }),
    item('e', 5200, { title: 'Apple iPhone 13 Pro Max 256 GB Grafite' }),
    item('f', 5100, { title: 'Apple iPhone 13 Pro Max 256 GB Azul' }),
    item('g', 40, { title: 'Capa iPhone 13' })
  ];
  const r = analyze(items, {}, NOW, 'iphone 13');
  const a = r.items.find((i) => i.id === 'a');
  // Antes: mediana geral ~3100-5000 faria o 128 GB parecer "boa oportunidade". Agora compara só com 128 GB.
  assert.equal(a.label, 'regular');
  assert.equal(a.isCheapest, true);
  assert.equal(r.items.find((i) => i.id === 'd').isCheapest, true);
  const g = r.items.find((i) => i.id === 'g');
  assert.equal(g.equivalent, false);
  assert.equal(g.diffVsMedian, null);
  assert.equal(r.items[r.items.length - 1].id, 'g'); // não equivalentes no fim
  assert.equal(r.stats.equivalentCount, 6);
});

test('grupo com menos de 3 equivalentes não gera "boa oportunidade" sem histórico', () => {
  const r = analyze([item('a', 50, { title: 'Produto X' }), item('b', 100, { title: 'Produto X' })], {}, NOW, 'produto x');
  assert.equal(r.items.find((i) => i.id === 'a').label, 'regular');
});

test('falso positivo corrigido: "% OFF" com preço "de" já observado não é suspeito', () => {
  // Produto visto a 100 (um dia) e 130 (outros dias); hoje 120 "de 130". O preço "de" existiu.
  const hist = { count: 3, days: 3, min: 100, max: 130, avg: 120 };
  const v = classify(item('a', 120, { originalPrice: 130 }), 120, null, hist);
  assert.notEqual(v.label, 'suspeito');
  assert.equal(v.label, 'regular');
  assert.ok(v.reasons.some((r) => r.includes('já foi visto por R$ 100')));
});

test('histórico de 1 dia dá confiança baixa', () => {
  const hist = { count: 2, days: 1, min: 100, max: 100, avg: 100 };
  const v = classify(item('a', 80), 80, null, hist);
  assert.equal(v.label, 'excelente');
  assert.equal(v.confidence, 'baixa');
});

test('poda do histórico preserva itens acompanhados e remove os mais antigos', () => {
  const prices = {};
  for (let i = 0; i < 10; i++) prices['MLB' + i] = { points: [{ t: i, price: 1 }] };
  const removed = prune(prices, { MLB0: {} }, 5);
  assert.equal(removed, 5);
  assert.ok(prices.MLB0, 'acompanhado mantido');
  assert.deepEqual(Object.keys(prices).sort(), ['MLB0', 'MLB6', 'MLB7', 'MLB8', 'MLB9']);
});
