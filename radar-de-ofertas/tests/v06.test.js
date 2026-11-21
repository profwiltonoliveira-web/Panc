// Testes da v0.6 — classificação em 5 classes, relatório, busca por marcas.
// Todos os títulos e preços são SINTÉTICOS (ilustrativos), não anúncios reais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreOffer, scoreAll, classify, LABELS } from '../lib/scoring.js';
import { assessPrice, assessDiscount, peerStats } from '../lib/pricing.js';
import { classificationReport } from '../lib/report.js';
import { SUGGESTIONS as BRANDS, resolveBrand, matchBrand, buildBrandSources, learnTerms, nextPageUrl } from '../lib/brands.js';
import { categorize } from '../lib/categories.js';

const mem = {};
globalThis.chrome = { storage: { local: {
  async get(keys) { if (keys == null) return JSON.parse(JSON.stringify(mem)); const ks = Array.isArray(keys) ? keys : [keys]; return Object.fromEntries(ks.filter((k) => k in mem).map((k) => [k, JSON.parse(JSON.stringify(mem[k]))])); },
  async set(o) { for (const [k, v] of Object.entries(o)) mem[k] = JSON.parse(JSON.stringify(v)); },
  async remove(keys) { for (const k of [].concat(keys)) delete mem[k]; },
  async getBytesInUse() { return 0; }
} } };
const store = await import('../lib/storage.js');

const DAY = 86400000, NOW = Date.UTC(2026, 10, 23, 12);
let seq = 1;
const offer = (title, price, extra = {}) => ({ id: 'MLB' + (6000000000 + seq++), title, price, originalPrice: null, freeShipping: true, shipping: 0, condition: null, image: 'https://http2.mlstatic.com/x.jpg', category: categorize(title), seller: 'Loja', officialStore: false, badges: [], rating: null, reviews: null, link: 'https://produto.mercadolivre.com.br/MLB-1-x-_JM', sources: [], ...extra });
const P = (...p) => peerStats(p);

// ================= Parte 1: classificação =================
test('5 classes existem, com rótulos em português', () => {
  assert.deepEqual(Object.values(LABELS), ['Excelente oportunidade', 'Boa oportunidade', 'Preço competitivo', 'Preço regular', 'Oferta suspeita']);
});

test('produto barato SEM desconto anunciado: classe pela atratividade, desconto real = nenhum', () => {
  const ex = scoreOffer(offer('Air Fryer Mondial AF-30 4L', 259), null, P(399, 389, 410, 405, 420));
  assert.equal(ex.label, 'excelente');
  assert.equal(ex.realDiscount.level, 'nenhum');
  assert.equal(ex.discountKind, null);
  assert.match(ex.basis, /abaixo de 5 equivalentes/);
  const boa = scoreOffer(offer('Air Fryer Mondial AF-30 4L', 289), null, P(399, 389, 410, 405));
  assert.equal(boa.label, 'boa'); // −27% mas só 4 equivalentes
  const comp = scoreOffer(offer('Air Fryer Mondial AF-30 4L', 360), null, P(399, 389, 410));
  assert.equal(comp.label, 'competitivo');
  const reg = scoreOffer(offer('Air Fryer Mondial AF-30 4L', 399), null, P(399, 389, 410));
  assert.equal(reg.label, 'regular');
  // sem equivalentes: barato não vira nada além de "regular" (sem referência)
  assert.equal(scoreOffer(offer('Produto Único XZ-1', 10), null, null).label, 'regular');
});

test('descontos suspeitos: "de" nunca observado, "de" inflado, ≥ 70% sem base, preço anômalo', () => {
  const h = { avg: 205, min: 199, max: 215, days: 4, count: 4 };
  assert.equal(scoreOffer(offer('Liquidificador Arno LN55', 199, { originalPrice: 499 }), h, null).label, 'suspeito');
  assert.equal(scoreOffer(offer('Fone JBL Tune 520BT', 249, { originalPrice: 599 }), null, P(239, 249, 259, 245)).label, 'suspeito');
  assert.equal(scoreOffer(offer('Perfume X', 60, { originalPrice: 300 }), null, null).label, 'suspeito');
  assert.equal(scoreOffer(offer('Apple iPhone 15 128GB', 1200), null, P(4500, 4600, 4700, 4550)).label, 'suspeito');
  const s = scoreOffer(offer('Perfume X', 60, { originalPrice: 300 }), null, null);
  assert.equal(s.discountKind, null); // suspeita não exibe desconto
  assert.ok(s.score <= 30);
});

test('desconto real: comprovado > corroborado > campanha > anunciado', () => {
  const pa = (o, h, p) => assessPrice(o, h, p);
  const o1 = offer('Smart TV LG 55UR8750', 2399);
  const h = { avg: 2899, min: 2799, max: 2999, days: 5, count: 5 };
  assert.equal(assessDiscount(o1, pa(o1, h, P()), P()).level, 'comprovado');
  const o2 = offer('Smart TV LG 55UR8750', 2399, { originalPrice: 2999 });
  const p2 = P(2899, 2950, 2999, 2850);
  assert.equal(assessDiscount(o2, pa(o2, null, p2), p2).level, 'corroborado');
  const o3 = offer('Produto Raro', 300, { originalPrice: 450, sources: ['cat-casa'], badges: ['OFERTA DO DIA'] });
  assert.equal(assessDiscount(o3, pa(o3, null, P()), P()).level, 'campanha');
  assert.equal(scoreOffer(o3, null, null).label, 'boa'); // 33% em campanha oficial do ML
  const o4 = offer('Produto Raro', 300, { originalPrice: 450, sources: ['marca-x'] }); // fora da página oficial de ofertas
  assert.equal(assessDiscount(o4, pa(o4, null, P()), P()).level, 'anunciado');
  assert.equal(scoreOffer(o4, null, null).label, 'regular');
  const o5 = offer('Produto Raro', 300, { originalPrice: 450, sources: ['ofertas'] }); // página oficial mas sem selo/loja oficial
  assert.equal(assessDiscount(o5, pa(o5, null, P()), P()).level, 'anunciado');
});

test('desconto comprovado com histórico de vários dias → excelente; acima do mercado não', () => {
  const h = { avg: 2899, min: 2799, max: 2999, days: 5, count: 5 };
  assert.equal(scoreOffer(offer('Smart TV LG 55UR8750', 2399), h, P(2799, 2899, 2850)).label, 'excelente');
  const above = scoreOffer(offer('Smart TV LG 55UR8750', 2599), h, P(1999, 2099, 2050));
  assert.notEqual(above.label, 'excelente');
});

test('os dois indicadores são separados (A não depende de B)', () => {
  const r = scoreOffer(offer('Air Fryer Mondial AF-30 4L', 259), null, P(399, 389, 410, 405, 420));
  assert.equal(r.realDiscount.value, 0);
  assert.ok(r.attractiveness >= 80);
  const h = { avg: 2899, min: 2799, max: 2999, days: 5, count: 5 };
  const r2 = scoreOffer(offer('X 1', 2399), h, null);
  assert.ok(r2.realDiscount.value > 60);
});

test('relatório: distribuição, classes antiga × nova, penalidades e impacto do histórico', () => {
  const list = [
    offer('Air Fryer Mondial AF-30 4L Preta', 259), offer('Air Fryer Mondial AF-30 4L Preto', 399), offer('Air Fryer Mondial AF-30 4L', 389), offer('Air Fryer Mondial AF-30 4L Inox', 410), offer('Air Fryer Mondial AF-30 4L', 405), offer('Air Fryer Mondial AF-30 4L', 420),
    offer('Perfume X', 60, { originalPrice: 300 }), offer('Produto Raro', 300, { originalPrice: 450 })
  ];
  const offers = Object.fromEntries(list.map((o) => [o.id, o]));
  const prices = { [list[7].id]: { points: [{ t: NOW - 4 * DAY, price: 460 }, { t: NOW - 2 * DAY, price: 455 }] } };
  const r = classificationReport(offers, prices, NOW);
  assert.equal(r.total, 8);
  assert.equal(Object.values(r.novo.classes).reduce((a, b) => a + b, 0), 8);
  assert.equal(r.novo.classes['Excelente oportunidade'] >= 1, true);
  // v0.5.1 só tinha "excelente" com histórico (aqui, 1 oferta tem histórico de 2 dias)
  assert.equal(r.antigo.classes['Excelente oportunidade'] || 0, 1);
  assert.equal(r.impactoDoHistorico.ofertasComHistorico, 1);
  assert.equal(r.impactoDoHistorico.descontosComprovados, 1);
  assert.ok(r.penalidades.semHistoricoDe2Dias === 7);
  assert.ok(r.novo.notas.min <= r.novo.notas.media && r.novo.notas.media <= r.novo.notas.max);
  assert.ok(Object.keys(r.mudancas).length >= 2);
});

// ================= Parte 2: marcas =================
const BRAND_CASES = {
  nike: { own: ['Tênis Nike Revolution 7 Masculino', 'Camiseta Nike Dri-Fit Academy', 'Mochila Nike Brasilia 24L', 'Boné Nike Featherlight', 'Chuteira Nike Phantom Society'], compat: ['Cadarço Para Tênis Nike Air Force'], other: ['Tênis Olympikus Corre 3 Tipo Nike', 'Tênis Similar Nike Air Max'] },
  adidas: { own: ['Tênis Adidas Duramo SL', 'Calça Adidas Essentials', 'Bola Adidas Al Rihla Society', 'Mochila Adidas Classic'], compat: [], other: ['Camiseta Nike Dry Fit Estilo Adidas', 'Tênis Fila Tipo Adidas'] },
  samsung: { own: ['Smartphone Samsung Galaxy A15 128GB', 'Smart TV Samsung 50 Polegadas UN50DU7700', 'Tablet Samsung Galaxy Tab A9', 'Geladeira Samsung Frost Free 460L', 'Capa Original Samsung Galaxy S24'], compat: ['Capa Para Samsung Galaxy S24', 'Carregador Turbo 25W Compatível Samsung'], other: ['Fone Xiaomi Redmi Buds Para Samsung E iPhone'] },
  jbl: { own: ['Fone De Ouvido JBL Tune 520BT', 'Caixa De Som JBL Flip 6', 'Soundbar JBL Cinema SB180', 'Headset JBL Quantum 100'], compat: ['Case Para Caixa JBL Flip 6'], other: ['Fone Tipo JBL Bluetooth'] },
  xiaomi: { own: ['Celular Xiaomi Redmi Note 13 256GB', 'Smartwatch Xiaomi Redmi Watch 4', 'Fone Xiaomi Redmi Buds 6 Active', 'Aspirador Robô Xiaomi E10'], compat: ['Película Para Xiaomi Redmi Note 13'], other: [] },
  mondial: { own: ['Ventilador Mondial VTX-40 40cm', 'Air Fryer Mondial AF-30 4L', 'Liquidificador Mondial L-1000', 'Cafeteira Mondial C-30'], compat: ['Cesto Para Air Fryer Mondial'], other: ['Air Fryer Britânia Tipo Mondial'] },
  motorola: { own: ['Smartphone Motorola Moto G54 256GB', 'Moto G84 5G 256GB', 'Motorola Edge 50 Fusion 256GB', 'Fone Motorola Moto Buds 600'], compat: ['Película Para Moto G54', 'Capinha Para Motorola Edge 50'], other: [] },
  philips: { own: ['Air Fryer Philips Walita 4,1L', 'Barbeador Philips OneBlade QP2724', 'Secador Philips Essential 2100W', 'Monitor Philips 24 Polegadas 241V8'], compat: ['Lâmina Refil Compatível Philips OneBlade'], other: [] },
  electrolux: { own: ['Geladeira Electrolux Frost Free 380L', 'Fogão Electrolux 4 Bocas', 'Micro-ondas Electrolux 34L', 'Aspirador Electrolux Ergorapido'], compat: ['Filtro Refil Para Purificador Electrolux'], other: [] },
  lg: { own: ['Smart TV LG 55 Polegadas 4K 55UR8750', 'Geladeira LG Frost Free 423L', 'Lava E Seca LG 11kg VC4', 'Monitor LG UltraGear 24GN60R'], compat: ['Controle Remoto Para TV LG'], other: [] }
};

test('as 10 marcas pedidas existem como sugestões (atalhos) com várias linhas de produto', () => {
  for (const b of ['nike', 'adidas', 'samsung', 'jbl', 'xiaomi', 'mondial', 'motorola', 'philips', 'electrolux', 'lg']) {
    assert.ok(BRANDS[b], b);
    assert.ok(BRANDS[b].terms.length >= 4, b);
    const src = buildBrandSources(resolveBrand(b));
    assert.ok(src.length >= 5, b);
    assert.ok(src.every((s) => s.url.startsWith('https://lista.mercadolivre.com.br/') && s.brand === b));
    assert.equal(new Set(src.map((s) => s.url)).size, src.length, 'consultas diferentes');
  }
  assert.equal(buildBrandSources(resolveBrand('Samsung'))[1].url, 'https://lista.mercadolivre.com.br/celular-samsung');
});

for (const [b, c] of Object.entries(BRAND_CASES)) {
  test(`marca ${BRANDS[b].name}: produtos da marca, acessórios de terceiros e outras fabricantes`, () => {
    const brand = resolveBrand(b);
    for (const t of c.own) assert.ok(['marca', 'oficial'].includes(matchBrand({ title: t }, brand).match), `${t} deveria ser da marca`);
    for (const t of c.compat) assert.equal(matchBrand({ title: t }, brand).match, 'compativel', t);
    for (const t of c.other) assert.equal(matchBrand({ title: t }, brand).match, 'outra-marca', t);
    assert.equal(matchBrand({ title: 'Produto Genérico Sem Marca' }, brand).match, 'ausente');
    // diversidade: tipos de produto diferentes (1ª palavra do título: tênis, camiseta, mochila…)
    const types = new Set(c.own.map((t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/)[0]));
    assert.ok(types.size >= 3, `${b}: ${[...types]}`);
  });
}

test('marca: loja oficial reconhecida pelo vendedor; "Moto" de motocicleta não é Motorola', () => {
  assert.equal(matchBrand({ title: 'Kit 3 Pares De Meias', seller: 'Nike', officialStore: true }, resolveBrand('nike')).match, 'oficial');
  assert.equal(matchBrand({ title: 'Capacete Para Moto Fechado' }, resolveBrand('motorola')).match, 'ausente');
  assert.equal(matchBrand({ title: 'Baú Para Moto 45 Litros' }, resolveBrand('motorola')).match, 'ausente');
});

test('marca digitada (não cadastrada): resolve, consulta e aprende linhas de produto dos títulos', () => {
  const b = resolveBrand('Havaianas');
  assert.equal(b.known, false);
  assert.equal(b.id, 'havaianas');
  assert.equal(buildBrandSources(b).length, 1); // só a marca; linhas vêm depois, dos títulos
  assert.equal(matchBrand({ title: 'Chinelo Havaianas Top' }, b).match, 'marca');
  const learned = learnTerms([{ title: 'Chinelo Havaianas Top' }, { title: 'Chinelo Havaianas Slim' }, { title: 'Bolsa Havaianas Praia' }, { title: 'Sandália Havaianas Flash' }]);
  assert.ok(learned.includes('chinelo'), learned.join());
  const multi = resolveBrand('Black Decker');
  assert.equal(matchBrand({ title: 'Furadeira Black Decker 560W' }, multi).match, 'marca');
});

test('paginação da busca: formato _Desde_N', () => {
  assert.equal(nextPageUrl('https://lista.mercadolivre.com.br/tenis-nike', 49), 'https://lista.mercadolivre.com.br/tenis-nike_Desde_49_NoIndex_True');
  assert.equal(nextPageUrl('https://lista.mercadolivre.com.br/tenis-nike_Desde_49_NoIndex_True', 97), 'https://lista.mercadolivre.com.br/tenis-nike_Desde_97_NoIndex_True');
});

test('marca: deduplicação e marcas acumuladas na mesma oferta; classificação por atratividade', async () => {
  for (const k of Object.keys(mem)) delete mem[k];
  const tv = offer('Smart TV Samsung 50 Polegadas UN50DU7700', 2199, { brands: { samsung: 'marca' } });
  await store.mergeOffers([tv], { id: 'marca-samsung', category: null }, NOW);
  await store.mergeOffers([{ ...tv, brands: { samsung: 'oficial' } }], { id: 'marca-samsung-smart-tv', category: null }, NOW + 1000);
  await store.mergeOffers([tv], { id: 'cat-eletronicos', category: 'eletronicos' }, NOW + 2000);
  const { offers } = await store.getRadar();
  assert.equal(Object.keys(offers).length, 1);
  assert.deepEqual(offers[tv.id].brands, { samsung: 'oficial' });
  assert.equal(offers[tv.id].sources.length, 3);
  const s = scoreAll([tv, { ...tv }, offer('Smart TV Samsung 50 Polegadas UN50DU7700 Crystal', 2999), offer('Smart TV Samsung UN50DU7700 50', 3099), offer('Samsung Smart TV UN50DU7700 50 Polegadas', 3050), offer('Smart TV 50 Samsung UN50DU7700', 2950), offer('Smart TV Samsung UN50DU7700 4K 50"', 3010)], {}, NOW);
  assert.equal(s.length, 6);
  assert.equal(s.find((o) => o.id === tv.id).label, 'excelente'); // 27% abaixo de 5 equivalentes
});

test('favoritos de marca, marcas personalizadas e histórico de buscas por marca', async () => {
  for (const k of Object.keys(mem)) delete mem[k];
  assert.equal(await store.toggleBrandFav('nike'), true);
  assert.equal(await store.toggleBrandFav('jbl'), true);
  assert.equal(await store.toggleBrandFav('nike'), false);
  await store.saveCustomBrand('havaianas', resolveBrand('Havaianas'));
  await store.addBrandSearch({ t: NOW, brand: 'jbl', name: 'JBL', found: 10, kept: 7, compat: 2, excluded: 1 });
  const d = await store.getBrandData();
  assert.deepEqual(d.brandFavs, ['jbl']);
  assert.equal(d.customBrands.havaianas.name, 'Havaianas');
  assert.equal(d.brandSearches[0].kept, 7);
  const s = await store.saveSettings({ monitorBrands: ['jbl', 'havaianas'] });
  assert.deepEqual(s.monitorBrands, ['jbl', 'havaianas']);
});
