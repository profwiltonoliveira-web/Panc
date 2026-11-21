// Testes da v0.5 (inteligência de preços, equivalência, pontuação, fontes, armazenamento).
// Todos os dados são SINTÉTICOS (títulos e preços ilustrativos), não anúncios reais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProduct, groupEquivalents, isAccessoryTitle } from '../lib/product.js';
import { assessPrice, peerStats } from '../lib/pricing.js';
import { scoreOffer, scoreAll, DEFAULT_WEIGHTS, normalizeWeights, shareText } from '../lib/scoring.js';
import { prioritizeSources } from '../lib/discovery.js';

// chrome.storage.local em memória (para storage.js)
const mem = {};
globalThis.chrome = {
  storage: { local: {
    async get(keys) {
      if (keys == null) return JSON.parse(JSON.stringify(mem));
      const ks = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(ks.filter((k) => k in mem).map((k) => [k, JSON.parse(JSON.stringify(mem[k]))]));
    },
    async set(obj) { for (const [k, v] of Object.entries(obj)) mem[k] = JSON.parse(JSON.stringify(v)); },
    async remove(keys) { for (const k of [].concat(keys)) delete mem[k]; },
    async getBytesInUse() { return Object.entries(mem).reduce((n, [k, v]) => n + k.length + JSON.stringify(v).length, 0); }
  } }
};
const store = await import('../lib/storage.js');

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 22, 12);
let seq = 1;
const offer = (title, price, extra = {}) => ({ id: 'MLB' + (9000000000 + seq++), title, price, originalPrice: null, freeShipping: true, shipping: 0, condition: null, image: 'https://http2.mlstatic.com/x.jpg', category: 'celulares', seller: 'Loja', officialStore: false, badges: [], rating: null, reviews: null, link: 'https://produto.mercadolivre.com.br/MLB-1-x-_JM', ...extra });
const hist = (avg, min, max, days, count = days) => ({ avg, min, max, days, count });
const peers = (...p) => peerStats(p);

// ---------- 1) Produtos baratos sem desconto anunciado ----------
test('barato sem desconto: sinal de preço, mas NÃO é promoção', () => {
  const r = scoreOffer(offer('Air Fryer Mondial 4L', 249), null, peers(399, 410, 389, 420, 405));
  assert.equal(r.label, 'regular');
  assert.equal(r.labelText, 'Sem promoção confirmada');
  assert.equal(r.discountKind, null);
  assert.equal(r.priceSignal, 'preco-excepcional');
  assert.ok(r.attractiveness >= 80, String(r.attractiveness));
  const c = scoreOffer(offer('Air Fryer Mondial 4L', 360), null, peers(399, 410, 389, 420, 405));
  assert.equal(c.priceSignal, 'preco-competitivo');
  assert.equal(c.label, 'regular');
});

// ---------- 2) Descontos artificiais ----------
test('desconto artificial: "de" nunca observado no histórico', () => {
  const r = scoreOffer(offer('Liquidificador Arno 12V', 199, { originalPrice: 499 }), hist(205, 195, 215, 4), null);
  assert.equal(r.label, 'suspeito');
  assert.equal(r.priceSignal, 'desconto-artificial');
  assert.equal(r.discountKind, null);
  assert.ok(r.score <= 30);
});
test('desconto artificial: "de" inflado frente ao que equivalentes custam', () => {
  const r = scoreOffer(offer('Fone JBL Tune 520BT', 249, { originalPrice: 599 }), null, peers(239, 249, 259, 245));
  assert.equal(r.priceSignal, 'desconto-artificial');
  assert.equal(r.label, 'suspeito');
});
test('desconto anunciado coerente continua "anunciado" (não comprovado)', () => {
  const r = scoreOffer(offer('Fone JBL Tune 520BT', 199, { originalPrice: 299 }), null, peers(259, 269, 279, 249));
  assert.equal(r.discountKind, 'anunciado');
  assert.ok(r.priceInfo.signals.includes('desconto-anunciado'));
  assert.equal(r.label, 'boa');
});
test('desconto anunciado sem nenhuma referência: oportunidade NÃO confirmada', () => {
  const r = scoreOffer(offer('Produto Raro XZ-9', 100, { originalPrice: 150 }), null, null);
  assert.ok(r.priceInfo.signals.includes('nao-confirmada'));
  assert.equal(r.attractiveness, null); // sem referência: não inventa um número
  assert.equal(r.priceSignalText, 'Oportunidade não confirmada');
  assert.equal(r.label, 'regular'); // não confirmada ≠ promoção
  assert.equal(r.discountKind, 'anunciado'); // mas o desconto anunciado continua visível
});

// ---------- 3) Produtos usados ----------
test('usado não é comparado com novo e perde pontos de condição', () => {
  const g = groupEquivalents([
    { id: 'a', title: 'Apple iPhone 13 128GB' },
    { id: 'b', title: 'Apple iPhone 13 128GB Usado' },
    { id: 'c', title: 'Apple iPhone 13 128GB', condition: 'usado' }
  ].map((o) => ({ ...o, product: parseProduct(o.title, o.condition) })));
  assert.notEqual(g.get('a'), g.get('b'));
  assert.equal(g.get('b'), g.get('c'));
  const novo = scoreOffer(offer('X', 100, { originalPrice: 140 }), null, null).score;
  const usado = scoreOffer(offer('X', 100, { originalPrice: 140, condition: 'usado' }), null, null).score;
  assert.ok(novo > usado);
});

// ---------- 4) Acessórios ----------
test('acessórios identificados e separados do produto principal', () => {
  for (const t of ['Capa Capinha Para iPhone 15', 'Película 3D Galaxy S24', 'Carregador Turbo 25W Compatível Samsung', 'Kit Película + Capa iPhone 13', 'Controle Sem Fio Para PS5', 'Tela Display Frontal Moto G54'])
    assert.equal(isAccessoryTitle(t), true, t);
  for (const t of ['Apple iPhone 15 128GB', 'Kit 3 Camisetas Nike', 'Smart TV 50 Polegadas Com Controle', 'Fone Bluetooth Com Cabo', 'Bolsa Feminina Couro', 'Console PlayStation 5 Com Controle'])
    assert.equal(isAccessoryTitle(t), false, t);
  const s = scoreAll([offer('Apple iPhone 15 128GB Preto', 4500), offer('Apple iPhone 15 128GB Azul', 4600), offer('Capa Para iPhone 15 128GB', 39)], {}, NOW);
  const capa = s.find((o) => /Capa/.test(o.title));
  assert.equal(capa.peers, 0); // capa não usa iPhones como referência (nem vice-versa)
  assert.notEqual(capa.label, 'suspeito');
});

// ---------- 5) Variantes de modelos ----------
test('marca, modelo, versão, capacidade, tamanho e quantidade separam produtos', () => {
  const pairs = [
    ['Apple iPhone 15 128GB Preto', 'Apple iPhone 15 256GB Preto'],
    ['Apple iPhone 15 128GB', 'Apple iPhone 15 Pro 128GB'],
    ['Samsung Galaxy S25 256GB', 'Samsung Galaxy S25 Ultra 256GB'],
    ['Samsung Galaxy A15 128GB', 'Samsung Galaxy A25 128GB'],
    ['Smart TV Samsung 50 Polegadas 4K Crystal', 'Smart TV Samsung 55 Polegadas 4K Crystal'],
    ['Air Fryer Mondial 4L Preta', 'Air Fryer Philco 4L Preta'],
    ['Perfume Malbec 100ml', 'Perfume Malbec 75ml'],
    ['Kit 2 Camisetas Nike Dry Fit', 'Camiseta Nike Dry Fit']
  ];
  for (const [a, b] of pairs) {
    const g = groupEquivalents([{ id: '1', title: a }, { id: '2', title: b }]);
    assert.notEqual(g.get('1'), g.get('2'), `${a} | ${b}`);
  }
  const same = [
    ['Apple iPhone 15 128GB Azul', 'iPhone 15 Apple 128 GB Rosa Lacrado'],
    ['Fone JBL Tune 520BT Azul', 'Fone De Ouvido Bluetooth JBL Tune 520BT Preto'],
    ['Samsung Galaxy S25 5G 256GB 12GB RAM Azul', 'Samsung Galaxy S25 256gb Navy'],
    ['Smart TV 50" Samsung UN50DU7700 4K', 'Samsung Smart TV 50 Polegadas UN50DU7700']
  ];
  for (const [a, b] of same) {
    const g = groupEquivalents([{ id: '1', title: a }, { id: '2', title: b }]);
    assert.equal(g.get('1'), g.get('2'), `${a} | ${b}`);
  }
  const p = parseProduct('Samsung Galaxy S25 Ultra 256GB 12GB RAM Titânio');
  assert.deepEqual([p.brand, p.model.join(' '), p.variant.join(' '), p.capacity, p.ram], ['samsung', 'galaxy s25', 'ultra', 256, 12]);
  assert.deepEqual(parseProduct('Liquidificador Arno 1,5L 550W').size, { l: 1.5, w: 550 });
  assert.deepEqual(parseProduct('Samsung Galaxy S25 5G 256GB').size, {}); // 5G é rede, não peso
  assert.deepEqual(parseProduct('Whey Protein Growth 900g').size, { g: 900 });
  assert.equal(parseProduct('Kit 3 Camisetas Nike').qty, 3);
});

// ---------- 6) Preços muito abaixo da concorrência ----------
test('preço > 60% abaixo de equivalentes: anômalo/suspeito, nunca "excepcional"', () => {
  const r = scoreOffer(offer('Apple iPhone 15 128GB', 1200), null, peers(4500, 4600, 4700, 4550));
  assert.equal(r.priceSignal, 'preco-anomalo');
  assert.equal(r.label, 'suspeito');
  assert.equal(r.attractiveness, null);
});
test('excepcional exige ≥ 4 equivalentes; com 3 só "competitivo"', () => {
  assert.equal(scoreOffer(offer('X 1', 70), null, peers(100, 100, 100)).priceSignal, 'preco-competitivo');
  assert.equal(scoreOffer(offer('X 1', 70), null, peers(100, 100, 100, 100)).priceSignal, 'preco-excepcional');
  assert.equal(scoreOffer(offer('X 1', 70), null, peers(100, 100)).priceSignal, 'sem-referencia'); // 2 é pouco
});

// ---------- 7) Produtos sem histórico ----------
test('sem histórico: nunca "comprovado" nem "excelente"', () => {
  const r = scoreOffer(offer('Notebook Dell Inspiron 15 3520', 2999, { originalPrice: 3999, officialStore: true }), null, peers(3499, 3599, 3399, 3550, 3600));
  assert.notEqual(r.discountKind, 'comprovado');
  assert.notEqual(r.label, 'excelente');
  assert.equal(r.subscores.comprovacao, 0);
});

// ---------- 8) Produtos com histórico de vários dias ----------
test('histórico de vários dias: desconto comprovado e excelente', () => {
  const r = scoreOffer(offer('Smart TV LG 55UR8750', 2399), hist(2899, 2799, 2999, 5), peers(2799, 2899, 2850, 2950));
  assert.equal(r.discountKind, 'comprovado');
  assert.equal(r.label, 'excelente');
  assert.ok(r.subscores.comprovacao > 0);
  assert.equal(Math.round(r.previousPrice), 2899);
  assert.match(shareText({ ...offer('TV', 2399), ...r }), /17% abaixo do preço médio que acompanhamos/);
});
test('histórico de 1 dia não comprova; acima da média não é promoção', () => {
  assert.notEqual(scoreOffer(offer('X', 80), hist(100, 100, 100, 1, 3), null).discountKind, 'comprovado');
  const r = scoreOffer(offer('X', 120, { originalPrice: 160 }), hist(100, 95, 160, 4), null);
  assert.notEqual(r.label, 'excelente');
  assert.ok(r.reasons.some((x) => /ACIMA da média observada/.test(x)));
});
test('scoreAll: histórico real (ignora a última hora) vira desconto comprovado', () => {
  const o = offer('Mouse Logitech G203', 99);
  const prices = { [o.id]: { points: [{ t: NOW - 4 * DAY, price: 139 }, { t: NOW - 2 * DAY, price: 135 }, { t: NOW - 30 * 60e3, price: 99 }] } };
  const [r] = scoreAll([o], prices, NOW);
  assert.equal(r.discountKind, 'comprovado');
  assert.equal(Math.round(r.discountPct), 28); // 99 vs média (139+135)/2 = 137 → −27,7%
});

// ---------- 9) Anúncios duplicados ----------
test('duplicados: mesmo ID unificado na pontuação e no armazenamento', async () => {
  const o = offer('Apple iPhone 15 128GB', 4500);
  const s = scoreAll([o, { ...o }, offer('Apple iPhone 15 128GB Azul', 4600)], {}, NOW);
  assert.equal(s.length, 2);
  assert.equal(s.find((x) => x.id === o.id).peers, 1); // não compara consigo mesmo
  for (const k of Object.keys(mem)) delete mem[k];
  await store.mergeOffers([o], { id: 'ofertas', category: null }, NOW);
  await store.mergeOffers([{ ...o, price: 4400 }], { id: 'cat-celulares', category: 'celulares' }, NOW + 1000);
  const { offers, prices } = await store.getRadar();
  assert.equal(Object.keys(offers).length, 1);
  assert.deepEqual(offers[o.id].sources.sort(), ['cat-celulares', 'ofertas']);
  assert.equal(offers[o.id].price, 4400);
  assert.equal(prices[o.id].points.length, 1); // mesma hora: um ponto, atualizado
});

// ---------- Pesos configuráveis ----------
test('pesos configuráveis mudam a nota; inválidos voltam ao padrão', () => {
  const o = offer('Fone JBL Tune 520BT', 199, { originalPrice: 299, officialStore: true });
  const p = peers(259, 269, 279, 249, 265);
  const a = scoreOffer(o, null, p, DEFAULT_WEIGHTS).score;
  const b = scoreOffer(o, null, p, { ...DEFAULT_WEIGHTS, preco: 0, comprovacao: 0, anunciado: 100 }).score;
  assert.notEqual(a, b);
  assert.deepEqual(normalizeWeights({ preco: -5, frete: 'x', vendedor: 500 }), DEFAULT_WEIGHTS);
  // separação dos eixos: preço atrativo não gera comprovação
  const r = scoreOffer(o, null, p);
  assert.ok(r.subscores.preco > 0 && r.subscores.comprovacao === 0);
});

// ---------- Fontes ----------
test('prioriza fontes por anúncios únicos por consulta; página geral primeiro; páginas seguem a anterior', () => {
  const list = [
    { id: 'ofertas' }, { id: 'ofertas-p2' }, { id: 'ofertas-ate-100' }, { id: 'cat-a' }, { id: 'cat-a-p2' }, { id: 'cat-b' }, { id: 'cat-c' }
  ];
  const stats = { 'ofertas-ate-100': { runs: 2, unique: 4 }, 'cat-a': { runs: 2, unique: 60 }, 'cat-b': { runs: 1, unique: 0 } };
  assert.deepEqual(prioritizeSources(list, stats).map((s) => s.id), ['ofertas', 'ofertas-p2', 'cat-c', 'cat-a', 'cat-a-p2', 'ofertas-ate-100', 'cat-b']);
});

test('estatísticas de fontes acumulam consultas, únicos e acessórios', async () => {
  for (const k of Object.keys(mem)) delete mem[k];
  const scan = (t, count, unique) => ({ t, sources: [{ id: 'cat-a', name: 'A', status: count ? 'ok' : 'vazio', count, unique, added: unique, accessories: 1 }, { id: 'cat-a-p2', name: 'A2', skipped: true, status: 'pulada' }] });
  await store.updateSourceStats(scan(1, 40, 30));
  const st = await store.updateSourceStats(scan(2, 0, 0));
  assert.deepEqual([st['cat-a'].runs, st['cat-a'].okRuns, st['cat-a'].items, st['cat-a'].unique, st['cat-a'].emptyRuns], [2, 1, 40, 30, 1]);
  assert.equal(st['cat-a-p2'], undefined); // pulada não conta como consulta
});

// ---------- Armazenamento ----------
test('poda por espaço: respeita orçamento, compacta pontos antigos e preserva favoritos', () => {
  const quota = 200000; // orçamento pequeno para o teste
  const prices = {}, offers = {}, watch = { MLBFAV: {} };
  for (let i = 0; i < 400; i++) {
    const pts = Array.from({ length: 40 }, (_, j) => ({ t: NOW - (60 - j) * DAY / 2, price: 100 + j }));
    prices['MLB' + i] = { title: 'Produto ' + i, link: 'https://produto.mercadolivre.com.br/MLB-' + i, points: pts };
  }
  prices.MLBFAV = { title: 'Favorito', link: 'x', points: [{ t: NOW - 90 * DAY, price: 1 }] };
  offers.MLB399 = { id: 'MLB399', lastSeen: NOW };
  const r = store.pruneBySize({ prices, offers, scans: [], searches: [], watch }, 0, NOW, quota);
  assert.ok(r.pruned);
  assert.ok(r.before > quota * 0.7);
  assert.ok(r.after <= quota * 0.55, `${r.after}`);
  assert.ok(prices.MLBFAV, 'favorito preservado');
  assert.ok(prices.MLB399, 'item no painel removido por último');
  assert.ok(r.removed.pontosCompactados > 0);
  // pontos com mais de 14 dias: no máximo 1 por dia
  const days = prices.MLB399.points.filter((p) => NOW - p.t > 14 * DAY).map((p) => Math.floor(p.t / DAY));
  assert.equal(new Set(days).size, days.length);
});
test('poda não age abaixo de 70% da cota', () => {
  const r = store.pruneBySize({ prices: { a: { points: [{ t: NOW, price: 1 }] } }, offers: {}, scans: [], searches: [], watch: {} }, 0, NOW);
  assert.equal(r.pruned, false);
});
test('pontos de preço não guardam "total" redundante', () => {
  const prices = {};
  store.addObservations(prices, [{ id: 'MLB1', title: 'x', link: 'x', price: 10, total: 10 }, { id: 'MLB2', title: 'y', link: 'y', price: 10, total: 25 }], NOW);
  assert.deepEqual(Object.keys(prices.MLB1.points[0]).sort(), ['price', 't']);
  assert.equal(prices.MLB2.points[0].total, 25);
});
