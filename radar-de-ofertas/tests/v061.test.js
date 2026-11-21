// Testes v0.6.1 — cadastro dinâmico de marcas (qualquer marca, sem lista fixa).
// Títulos SINTÉTICOS (ilustrativos), não anúncios reais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUGGESTIONS, normalizeBrand, resolveBrand, matchBrand, otherBrandWords, buildBrandSources } from '../lib/brands.js';

const mem = {};
globalThis.chrome = { storage: { local: {
  async get(keys) { if (keys == null) return JSON.parse(JSON.stringify(mem)); const ks = Array.isArray(keys) ? keys : [keys]; return Object.fromEntries(ks.filter((k) => k in mem).map((k) => [k, JSON.parse(JSON.stringify(mem[k]))])); },
  async set(o) { for (const [k, v] of Object.entries(o)) mem[k] = JSON.parse(JSON.stringify(v)); },
  async remove(keys) { for (const k of [].concat(keys)) delete mem[k]; },
  async getBytesInUse() { return 0; }
} } };
const store = await import('../lib/storage.js');
const reset = () => { for (const k of Object.keys(mem)) delete mem[k]; };

test('qualquer nome de marca é pesquisável, sem cadastro prévio', () => {
  for (const name of ['Havaianas', 'Stanley', 'Ninja', 'Black+Decker', 'Marca Inventada Zeta', 'Ö Boticário', '3M']) {
    const b = resolveBrand(name, {});
    assert.ok(b.id && b.name, name);
    const src = buildBrandSources(b);
    assert.ok(src.length >= 1 && src[0].url.startsWith('https://lista.mercadolivre.com.br/'), name);
  }
  const z = resolveBrand('Marca Inventada Zeta');
  assert.equal(z.registered, false);
  assert.equal(z.known, false);
  assert.equal(matchBrand({ title: 'Garrafa Marca Inventada Zeta 1L' }, z).match, 'marca');
  assert.equal(matchBrand({ title: 'Garrafa Térmica Genérica 1L' }, z).match, 'ausente');
});

test('sugestões são só atalhos: o cadastro do usuário prevalece', () => {
  assert.equal(resolveBrand('Xiaomi', {}).registered, false); // sugestão, não cadastro
  const mine = { xiaomi: { name: 'Xiaomi', aliases: ['xiaomi', 'redmi', 'poco', 'mijia'], terms: ['aspirador'] } };
  const b = resolveBrand('xiaomi', mine);
  assert.equal(b.registered, true);
  assert.deepEqual(b.terms, ['aspirador']);
  assert.equal(matchBrand({ title: 'Robô Aspirador Mijia S10' }, b).match, 'marca'); // apelido editado pelo usuário
  assert.equal(resolveBrand('mijia', mine).id, 'xiaomi'); // apelido resolve para a marca
});

test('validação do formulário de marca', () => {
  assert.equal(normalizeBrand({ name: ' ' }).ok, false);
  assert.equal(normalizeBrand({ name: 'X' }).ok, false);
  assert.equal(normalizeBrand({ name: 'A'.repeat(61) }).ok, false);
  const n = normalizeBrand({ name: '  Black  Decker ', aliases: 'B&D, blackdecker , moto*', terms: 'furadeira, Parafusadeira, furadeira' });
  assert.ok(n.ok);
  assert.equal(n.brand.name, 'Black Decker');
  assert.deepEqual(n.brand.aliases, ['blackdecker', 'bd', 'moto*']);
  assert.deepEqual(n.brand.terms, ['furadeira', 'parafusadeira']);
});

test('apelido com * exige modelo depois (ex.: Motorola "moto*")', () => {
  const b = resolveBrand('Motorola', {});
  assert.ok(b.aliases.includes('moto*'));
  for (const t of ['Moto G84 5G 256GB', 'Moto E13 64GB', 'Moto Edge 40 Neo', 'Moto Razr 40']) assert.equal(matchBrand({ title: t }, b).match, 'marca', t);
  for (const t of ['Baú Para Moto 45 Litros', 'Capacete Para Moto Fechado', 'Moto Elétrica Infantil']) assert.equal(matchBrand({ title: t }, b).match, 'ausente', t);
});

test('marca qualquer: acessório compatível de terceiros NÃO vira produto da fabricante', () => {
  const k = resolveBrand('Kindle', {});
  assert.equal(matchBrand({ title: 'Capa Para Kindle 11ª Geração' }, k).match, 'compativel');
  assert.equal(matchBrand({ title: 'Kindle 11ª Geração 16GB' }, k).match, 'marca');
  const s = resolveBrand('Stanley', {});
  assert.equal(matchBrand({ title: 'Tampa Compatível Com Copo Stanley' }, s).match, 'compativel');
  assert.equal(matchBrand({ title: 'Copo Térmico Stanley Quencher 1,18L' }, s).match, 'marca');
  assert.equal(matchBrand({ title: 'Copo Térmico Tipo Stanley 1L' }, s).match, 'outra-marca');
});

test('marcas cadastradas pelo usuário passam a contar como OUTRA fabricante nas buscas de outras marcas', () => {
  const registry = { aurora: { name: 'Aurora', aliases: ['aurora'], terms: [] } };
  const boreal = resolveBrand('Boreal', registry);
  const others = otherBrandWords(boreal, registry);
  assert.ok(others.has('aurora'));
  assert.ok(!others.has('boreal'));
  assert.equal(matchBrand({ title: 'Tênis Aurora Runner Igual Boreal' }, boreal, others).match, 'outra-marca');
  assert.equal(matchBrand({ title: 'Tênis Boreal Runner 2' }, boreal, others).match, 'marca');
  // sem o cadastro, "aurora" não seria reconhecida como fabricante
  assert.equal(matchBrand({ title: 'Tênis Aurora Runner Igual Boreal' }, boreal, otherBrandWords(boreal, {})).match, 'marca');
});

test('cadastro: criar, editar (id estável), impedir duplicado, excluir em cascata', async () => {
  reset();
  const n = normalizeBrand({ name: 'Havaianas', terms: 'chinelo' });
  const { id, created } = await store.saveBrand('havaianas', n.brand);
  assert.equal(id, 'havaianas'); assert.equal(created, true);
  await store.toggleBrandFav('havaianas');
  await store.setBrandMonitor('havaianas', true);
  // editar: muda nome, apelidos e linhas, mantendo o id
  const e = normalizeBrand({ name: 'Havaianas Oficial', aliases: 'havaianas', terms: 'chinelo, sandalia, bolsa' });
  const r = await store.saveBrand('havaianas', e.brand);
  assert.equal(r.created, false);
  let d = await store.getBrandData();
  assert.equal(d.brands.havaianas.name, 'Havaianas Oficial');
  assert.deepEqual(d.brands.havaianas.terms, ['chinelo', 'sandalia', 'bolsa']);
  assert.ok(d.brands.havaianas.createdAt <= d.brands.havaianas.updatedAt);
  // duplicado
  await store.saveBrand('nike', normalizeBrand({ name: 'Nike' }).brand);
  await assert.rejects(store.saveBrand('nike2', normalizeBrand({ name: 'nike' }).brand), /Já existe/);
  // cadastro novo com o mesmo id não sobrescreve (antes virava "edição" silenciosa)
  await assert.rejects(store.saveBrand('nike', normalizeBrand({ name: 'NIKE!' }).brand, { mode: 'create' }), /Já existe/);
  assert.equal((await store.getBrandData()).brands.nike.name, 'Nike');
  // excluir: sai do cadastro, dos favoritos e do monitoramento
  await store.deleteBrand('havaianas');
  d = await store.getBrandData();
  assert.equal(d.brands.havaianas, undefined);
  assert.deepEqual(d.brandFavs, []);
  assert.deepEqual((await store.getSettings()).monitorBrands, []);
  assert.ok(d.brands.nike);
});

test('várias marcas monitoradas ao mesmo tempo', async () => {
  reset();
  await store.setBrandMonitor('nike', true);
  await store.setBrandMonitor('jbl', true);
  await store.setBrandMonitor('marca-inventada-zeta', true);
  assert.deepEqual((await store.getSettings()).monitorBrands, ['nike', 'jbl', 'marca-inventada-zeta']);
  await store.setBrandMonitor('jbl', false);
  assert.deepEqual((await store.getSettings()).monitorBrands, ['nike', 'marca-inventada-zeta']);
});

test('migração da v0.6.0: "customBrands" vira o cadastro "brands"', async () => {
  reset();
  mem.customBrands = { havaianas: { name: 'Havaianas', aliases: ['havaianas'], phrase: 'havaianas', terms: [] } };
  const d = await store.getBrandData();
  assert.equal(d.brands.havaianas.name, 'Havaianas');
  assert.ok(mem.brands && !mem.customBrands);
});

test('sugestões continuam disponíveis como atalhos (não como lista fechada)', () => {
  assert.ok(Object.keys(SUGGESTIONS).length >= 10);
  assert.ok(Object.values(SUGGESTIONS).every((b) => b.aliases.every((a) => typeof a === 'string'))); // salváveis
});
