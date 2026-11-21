// Testes do caçador automático (v0.4). Dados SINTÉTICOS — não são anúncios reais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreOffer, scoreAll, isAccessoryTitle, clusterOffers, shareText, cleanLink } from '../lib/scoring.js';
import { categorize, buildSources, CATEGORIES } from '../lib/categories.js';

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 21, 12);
const offer = (id, title, price, extra = {}) => ({ id, title, price, originalPrice: null, freeShipping: false, condition: null, image: 'https://http2.mlstatic.com/x.jpg', category: 'celulares', seller: null, officialStore: false, badges: [], rating: null, reviews: null, link: `https://produto.mercadolivre.com.br/MLB-${id.replace(/\D/g, '')}-x-_JM`, ...extra });
const hist = (avg, min, max, days = 3, count = 3) => ({ avg, min, max, days, count });

test('preço baixo sem histórico NÃO vira desconto comprovado nem promoção', () => {
  // v0.5: antes virava "boa"; o requisito agora é não classificar produto barato como promoção.
  const r = scoreOffer(offer('MLB1', 'Fone X', 50), null, { n: 5, median: 100 });
  assert.equal(r.discountKind, null);
  // v0.6: 50% abaixo de 5 equivalentes é evidência forte → "excelente" pela ATRATIVIDADE, sem desconto
  assert.equal(r.label, 'excelente');
  assert.match(r.basis, /abaixo de 5 equivalentes/);
  assert.equal(r.realDiscount.level, 'nenhum');
  assert.equal(r.priceSignal, 'preco-excepcional');
  assert.ok(r.reasons.some((x) => /abaixo da mediana de 5 anúncios equivalentes/.test(x)));
});

test('desconto anunciado é rotulado como anunciado, não comprovado', () => {
  const r = scoreOffer(offer('MLB1', 'Air Fryer Y', 300, { originalPrice: 450 }), null, null);
  assert.equal(r.discountKind, 'anunciado');
  assert.equal(Math.round(r.discountPct), 33);
  assert.equal(r.previousPrice, null);
  // v0.5: sem histórico e sem equivalentes, o anúncio é "não confirmado" (antes: "boa")
  assert.equal(r.label, 'regular');
  assert.equal(r.priceSignal, 'nao-confirmada');
  // v0.6: "de" R$ 450 compatível com 4 equivalentes (mediana 380) e preço 21% abaixo deles → corroborado → excelente
  const c = scoreOffer(offer('MLB1', 'Air Fryer Y', 300, { originalPrice: 450 }), null, { n: 4, median: 380 });
  assert.equal(c.discountKind, 'corroborado');
  assert.equal(c.label, 'excelente');
  // com só 3 equivalentes, o mesmo caso é "boa"
  assert.equal(scoreOffer(offer('MLB1', 'Air Fryer Y', 300, { originalPrice: 450 }), null, { n: 3, median: 380 }).label, 'boa');
});

test('desconto comprovado pelo histórico → excelente', () => {
  const r = scoreOffer(offer('MLB1', 'Smart TV 50', 2000, { freeShipping: true }), hist(2600, 2400, 2800), null);
  assert.equal(r.discountKind, 'comprovado');
  assert.equal(Math.round(r.discountPct), 23);
  assert.equal(r.previousPrice, 2600);
  assert.equal(r.label, 'excelente');
});

test('histórico de 1 dia não comprova desconto', () => {
  const r = scoreOffer(offer('MLB1', 'Smart TV 50', 2000), hist(2600, 2600, 2600, 1, 2), null);
  assert.notEqual(r.discountKind, 'comprovado');
  assert.notEqual(r.label, 'excelente');
});

test('preço "de" nunca observado → suspeito, sem desconto exibido', () => {
  const r = scoreOffer(offer('MLB1', 'Liquidificador', 200, { originalPrice: 500 }), hist(210, 195, 220), null);
  assert.equal(r.label, 'suspeito');
  assert.equal(r.discountKind, null);
  assert.ok(r.score <= 30);
});

test('desconto anunciado ≥ 70% sem histórico → suspeito', () => {
  assert.equal(scoreOffer(offer('MLB1', 'Perfume', 60, { originalPrice: 300 }), null, null).label, 'suspeito');
});

test('preço absurdamente abaixo de semelhantes → suspeito', () => {
  assert.equal(scoreOffer(offer('MLB1', 'iPhone 15 128GB', 900), null, { n: 6, median: 5000 }).label, 'suspeito');
});

test('preço acima da média observada não ganha pontos de desconto', () => {
  const r = scoreOffer(offer('MLB1', 'Notebook', 4000), hist(3500, 3400, 3600), null);
  assert.equal(r.discountKind, null);
  assert.equal(r.label, 'regular');
});

test('vendedor, condição e frete pesam na pontuação', () => {
  const base = scoreOffer(offer('MLB1', 'Fone', 100, { originalPrice: 150 }), null, null).score;
  const good = scoreOffer(offer('MLB1', 'Fone', 100, { originalPrice: 150, officialStore: true, freeShipping: true, rating: 4.8, reviews: 500 }), null, null).score;
  const used = scoreOffer(offer('MLB1', 'Fone', 100, { originalPrice: 150, condition: 'usado' }), null, null).score;
  assert.ok(good > base && base > used, `${good} > ${base} > ${used}`);
});

test('acessórios identificados (sem marcar produtos principais)', () => {
  for (const t of ['Capa Capinha Para iPhone 15', 'Película De Vidro 3d Galaxy S24', 'Carregador Turbo Compatível Samsung', 'Cabo Usb-c Para iPhone', 'Pulseira Para Smartwatch'])
    assert.equal(isAccessoryTitle(t), true, t);
  for (const t of ['Apple iPhone 15 128GB', 'Bolsa Feminina De Couro', 'Kit 3 Camisetas Básicas', 'Fone Bluetooth Com Cabo', 'Smart TV 50 Polegadas Com Controle'])
    assert.equal(isAccessoryTitle(t), false, t);
});

test('agrupamento: equivalentes juntos; acessório e variante separados', () => {
  const offers = [
    offer('MLB1', 'Apple iPhone 15 128GB Preto', 4500),
    offer('MLB2', 'Apple iPhone 15 128GB Azul', 4600),
    offer('MLB3', 'iPhone 15 Apple 128GB Rosa Novo', 4700),
    offer('MLB4', 'Capa Para iPhone 15 128GB Silicone', 40),
    offer('MLB5', 'Apple iPhone 15 Pro Max 256GB Titânio', 8000)
  ];
  const c = clusterOffers(offers);
  assert.equal(c.get('MLB1'), c.get('MLB2'));
  assert.equal(c.get('MLB1'), c.get('MLB3'));
  assert.notEqual(c.get('MLB1'), c.get('MLB4'));
  assert.notEqual(c.get('MLB1'), c.get('MLB5'));
  const s = scoreAll(offers, {}, NOW);
  assert.equal(s.find((o) => o.id === 'MLB4').accessory, true);
  assert.equal(s.find((o) => o.id === 'MLB4').label === 'suspeito', false); // acessório não é comparado ao celular
  assert.equal(s.find((o) => o.id === 'MLB1').peers, 2); // v0.5: conta só os OUTROS equivalentes
});

test('scoreAll usa histórico gravado (ignora observações da última hora)', () => {
  const prices = { MLB1: { points: [{ t: NOW - 4 * DAY, price: 120 }, { t: NOW - 2 * DAY, price: 118 }, { t: NOW - 10 * 60e3, price: 90 }] } };
  const [o] = scoreAll([offer('MLB1', 'Mouse Gamer', 90)], prices, NOW);
  assert.equal(o.discountKind, 'comprovado');
  assert.equal(Math.round(o.previousPrice), 119);
});

test('categorização pelo título', () => {
  assert.equal(categorize('Smartphone Samsung Galaxy A15 128GB'), 'celulares');
  assert.equal(categorize('Air Fryer Mondial 4L'), 'eletrodomesticos');
  assert.equal(categorize('Tênis Nike Revolution Masculino'), 'moda');
  assert.equal(categorize('Perfume Masculino 100ml'), 'beleza');
  assert.equal(categorize('Furadeira De Impacto 650W'), 'ferramentas');
  assert.equal(categorize('Jogo De Panelas Antiaderente 5 Peças'), 'casa');
  assert.equal(categorize('Notebook Lenovo Ideapad'), 'informatica');
  assert.equal(categorize('Produto Misterioso XYZ'), 'outros');
});

test('fontes: página oficial de ofertas, até R$100 e uma por categoria, com paginação', () => {
  const s1 = buildSources({ pages: 1 });
  assert.equal(s1[0].url, 'https://www.mercadolivre.com.br/ofertas');
  assert.ok(s1.some((s) => s.url.includes('container_id=MLB779362-1')));
  const withMl = CATEGORIES.filter((c) => c.ml).length;
  assert.equal(s1.length, 2 + withMl);
  assert.ok(s1.every((s) => s.url.startsWith('https://www.mercadolivre.com.br/ofertas')));
  assert.ok(s1.find((s) => s.id === 'cat-ferramentas').url.endsWith('category=MLB263532'));
  const s2 = buildSources({ pages: 2, categories: ['celulares'] });
  assert.deepEqual(s2.map((s) => s.id), ['ofertas', 'ofertas-p2', 'ofertas-ate-100', 'cat-celulares', 'cat-celulares-p2']);
  assert.ok(s2[1].url.endsWith('/ofertas?page=2'));
  assert.ok(s2[4].url.endsWith('category=MLB1051&page=2'));
});

test('texto para grupos: só afirma o comprovado; link limpo', () => {
  const o1 = { ...offer('MLB1', 'Air Fryer', 300, { originalPrice: 450, freeShipping: true, seller: 'Mondial', officialStore: true, link: 'https://produto.mercadolivre.com.br/MLB-1-x-_JM?searchVariation=1#polycard_client=offers' }), discountKind: 'anunciado', discountPct: 33.3 };
  const t1 = shareText(o1);
  assert.match(t1, /De R\$ 450,00 por R\$ 300,00 \(33% OFF anunciado pela loja\)/);
  assert.match(t1, /Frete grátis/);
  assert.match(t1, /Mondial \(loja oficial\)/);
  assert.match(t1, /👉 https:\/\/produto\.mercadolivre\.com\.br\/MLB-1-x-_JM\n/);
  assert.doesNotMatch(t1, /polycard|searchVariation|menor preço/i);
  const t2 = shareText({ ...offer('MLB2', 'TV', 2000), discountKind: 'comprovado', discountPct: 23, previousPrice: 2600 });
  assert.match(t2, /23% abaixo do preço médio que acompanhamos \(R\$ 2\.600,00\)/);
  const t3 = shareText({ ...offer('MLB3', 'Mouse', 50), discountKind: null });
  assert.doesNotMatch(t3, /OFF|abaixo/);
  assert.equal(cleanLink('https://www.mercadolivre.com.br/x/p/MLB123?wid=MLB999&pdp_filters=a#y'), 'https://www.mercadolivre.com.br/x/p/MLB123?wid=MLB999');
});
