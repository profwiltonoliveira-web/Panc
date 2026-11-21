// E2E v0.6: busca por marcas (10 marcas), filtros, favoritos, histórico e monitoramento.
// ATENÇÃO: REDE SIMULADA. Um servidor HTTPS local responde às buscas do ML com páginas
// SINTÉTICAS. Estes testes validam o mecanismo; NÃO provam que alguma marca funciona no site real.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { execFileSync } = require('child_process');
const assert = require('assert/strict');
const EXT = path.resolve(__dirname, '..');

// Catálogo sintético por marca: produtos da marca (vários tipos), acessórios de terceiros,
// imitações/outras fabricantes e itens irrelevantes.
const CATALOG = {
  nike: { own: ['Tênis Nike Revolution 7 Masculino', 'Camiseta Nike Dri-Fit Academy', 'Mochila Nike Brasilia 24L', 'Boné Nike Featherlight', 'Chuteira Nike Phantom Society', 'Bermuda Nike Club'], compat: ['Cadarço Para Tênis Nike Air Force'], other: ['Tênis Olympikus Corre 3 Tipo Nike'] },
  adidas: { own: ['Tênis Adidas Duramo SL', 'Calça Adidas Essentials', 'Bola Adidas Al Rihla Society', 'Mochila Adidas Classic', 'Camiseta Adidas Own The Run'], compat: [], other: ['Tênis Fila Tipo Adidas'] },
  samsung: { own: ['Smartphone Samsung Galaxy A15 128GB', 'Smart TV Samsung 50 Polegadas UN50DU7700', 'Tablet Samsung Galaxy Tab A9', 'Geladeira Samsung Frost Free 460L', 'Monitor Samsung 24 Polegadas LS24C310'], compat: ['Capa Para Samsung Galaxy S24'], other: ['Fone Xiaomi Redmi Buds Para Samsung'] },
  jbl: { own: ['Fone De Ouvido JBL Tune 520BT', 'Caixa De Som JBL Flip 6', 'Soundbar JBL Cinema SB180', 'Headset JBL Quantum 100'], compat: ['Case Para Caixa JBL Flip 6'], other: ['Fone Tipo JBL Bluetooth'] },
  xiaomi: { own: ['Celular Xiaomi Redmi Note 13 256GB', 'Smartwatch Xiaomi Redmi Watch 4', 'Fone Xiaomi Redmi Buds 6 Active', 'Aspirador Robô Xiaomi E10'], compat: ['Película Para Xiaomi Redmi Note 13'], other: [] },
  mondial: { own: ['Ventilador Mondial VTX-40 40cm', 'Air Fryer Mondial AF-30 4L', 'Liquidificador Mondial L-1000', 'Cafeteira Mondial C-30'], compat: ['Cesto Para Air Fryer Mondial'], other: ['Air Fryer Britânia Tipo Mondial'] },
  motorola: { own: ['Smartphone Motorola Moto G54 256GB', 'Motorola Edge 50 Fusion 256GB', 'Fone Motorola Moto Buds 600', 'Carregador Motorola TurboPower 30W Original'], compat: ['Película Para Moto G54'], other: ['Capacete Para Moto Fechado'] },
  philips: { own: ['Air Fryer Philips Walita 4,1L', 'Barbeador Philips OneBlade QP2724', 'Secador Philips Essential 2100W', 'Monitor Philips 24 Polegadas 241V8'], compat: ['Lâmina Refil Compatível Philips OneBlade'], other: [] },
  electrolux: { own: ['Geladeira Electrolux Frost Free 380L', 'Fogão Electrolux 4 Bocas', 'Micro-ondas Electrolux 34L', 'Aspirador Electrolux Ergorapido'], compat: ['Filtro Refil Para Purificador Electrolux'], other: [] },
  lg: { own: ['Smart TV LG 55 Polegadas 4K 55UR8750', 'Geladeira LG Frost Free 423L', 'Lava E Seca LG 11kg VC4', 'Monitor LG UltraGear 24GN60R'], compat: ['Controle Remoto Para TV LG'], other: [] },
  // v0.6.1: marca FICTÍCIA, fora das sugestões e da lista de marcas conhecidas (prova que qualquer nome funciona)
  aurora: { own: ['Chinelo Aurora Classic', 'Mochila Aurora Trilha 30L', 'Bermuda Aurora Surf', 'Camiseta Aurora Basic', 'Chinelo Aurora Slim'], compat: ['Cadarço Para Tênis Aurora'], other: ['Chinelo Havaianas Tipo Aurora'] }
};
const IRRELEVANT = 'Produto Genérico Sem Marca Qualquer';
let idSeq = 5000000001;
const ids = new Map(); // título → ID fixo (o mesmo anúncio aparece em consultas diferentes → duplicado)
const idOf = (t) => { if (!ids.has(t)) ids.set(t, idSeq++); return ids.get(t); };
const card = (t, price, prev) => `<li class="ui-search-layout__item"><div class="poly-card"><h3><a class="poly-component__title" href="https://produto.mercadolivre.com.br/MLB-${idOf(t)}-x-_JM">${t}</a></h3><div class="poly-component__price">${prev ? `<s class="andes-money-amount andes-money-amount--previous"><span class="andes-money-amount__fraction">${prev}</span></s>` : ''}<div class="poly-price__current"><span class="andes-money-amount"><span class="andes-money-amount__fraction">${price}</span></span></div></div><div>Frete grátis</div></div></li>`;
const page = (cards) => `<!doctype html><html><head><title>Mercado Livre</title></head><body><ol class="ui-search-layout">${cards.join('')}</ol></body></html>`;
const priceOf = (t) => 50 + (t.length * 37) % 2500;

function pageFor(slug) {
  const m = slug.match(/^(.*?)(?:_Desde_(\d+)_NoIndex_True)?$/);
  const base = m[1], offset = m[2] ? Number(m[2]) : 0;
  const brand = Object.keys(CATALOG).find((b) => base === b || base.endsWith('-' + b));
  if (!brand) return page([]);
  const c = CATALOG[brand];
  if (base === brand) {
    // consulta só com a marca: tudo + 40 variações (para testar paginação na marca Nike)
    let cards = [...c.own, ...c.compat, ...c.other, IRRELEVANT].map((t) => card(t, priceOf(t), Math.round(priceOf(t) * 1.4)));
    if (brand === 'nike') {
      if (offset) return page(Array.from({ length: 8 }, (_, i) => card(`Meia Nike Everyday Kit ${i + 3} Pares`, 79 + i)));
      cards = cards.concat(Array.from({ length: 40 }, (_, i) => card(`Camiseta Nike Sportswear Modelo ${i + 1}`, 99 + i)));
    }
    return page(cards);
  }
  // consulta "termo + marca": itens da marca cujo título contém o termo + 1 duplicado + 1 irrelevante
  const term = base.slice(0, -(brand.length + 1)).replace(/-/g, ' ');
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const hits = c.own.filter((t) => norm(t).includes(term.split(' ')[0]));
  return page([...hits, c.own[0], IRRELEVANT].map((t) => card(t, priceOf(t), Math.round(priceOf(t) * 1.3))));
}

function selfSigned() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-e2e-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem')], { stdio: 'ignore' });
  return { key: fs.readFileSync(path.join(dir, 'k.pem')), cert: fs.readFileSync(path.join(dir, 'c.pem')) };
}

(async () => {
  const hits = [];
  const server = https.createServer(selfSigned(), (req, res) => {
    const host = (req.headers.host || '').split(':')[0];
    const u = new URL(req.url, 'https://' + host);
    const send = (st, body) => { res.writeHead(st, { 'content-type': 'text/html; charset=utf-8' }); res.end(body); };
    if (host === 'lista.mercadolivre.com.br') { hits.push({ t: Date.now(), path: u.pathname }); return send(200, pageFor(decodeURIComponent(u.pathname.slice(1)))); }
    if (host === 'www.mercadolivre.com.br' && u.pathname === '/ofertas') return send(200, page([]));
    return send(404, '');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true, ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-proxy-server', '--ignore-certificate-errors',
      `--host-resolver-rules=MAP *.mercadolivre.com.br 127.0.0.1:${port}, MAP api.mercadolibre.com 127.0.0.1:${port}, MAP *.mlstatic.com 127.0.0.1:${port}`]
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(sw.url().replace('background.js', 'app.html'));
  await p.click('[data-tab=buscar]');
  await p.click('.modes .mode[data-mode=marca]');
  const results = [];
  const report = [];
  const check = async (name, fn) => { try { await fn(); results.push(['OK', name]); } catch (e) { results.push(['FALHOU', name + ' — ' + e.message.split('\n')[0]]); } };
  const storage = () => p.evaluate(() => chrome.storage.local.get(null));
  // Espera a tarefa (kind) iniciada depois de `since` terminar. (waitForFunction com função async
  // resolveria na hora — a Promise conta como "verdadeiro"; por isso a verificação é feita aqui.)
  const waitJob = async (kind, since, timeout = 180000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const { radarState: st } = await p.evaluate(() => chrome.storage.local.get('radarState'));
      if (st && st.job && st.job.kind === kind && !st.running && st.startedAt >= since - 1000) return st;
      await p.waitForTimeout(500);
    }
    throw new Error('tempo esgotado esperando a tarefa ' + kind);
  };
  const runBrand = async (name) => {
    await p.fill('#brandInput', name);
    const clickedAt = Date.now();
    await p.click('#brandSearch');
    const st = await waitJob('marca', clickedAt); // a tarefa INICIADA depois do clique
    if (st.error) throw new Error('erro interno: ' + st.error);
    await p.waitForTimeout(400);
  };

  for (const [id, c] of Object.entries(CATALOG)) {
    await check(`marca ${id}: produtos da marca, sem mistura, acessórios separados, sem duplicados`, async () => {
      const t0 = Date.now();
      await runBrand(id === 'lg' ? 'LG' : id[0].toUpperCase() + id.slice(1));
      if (id === 'aurora') {
        const { brandSearches: bs, brands } = await storage();
        assert.ok(!brands || !brands.aurora, 'não precisou de cadastro');
        assert.ok(bs[0].learnedTerms.length >= 2, 'linhas de produto descobertas pelos títulos: ' + bs[0].learnedTerms);
      }
      const s = await storage();
      const mine = Object.values(s.offers).filter((o) => o.brands && o.brands[id]);
      const own = mine.filter((o) => o.brands[id] !== 'compativel').map((o) => o.title).sort();
      const compat = mine.filter((o) => o.brands[id] === 'compativel').map((o) => o.title).sort();
      const expectedOwn = id === 'nike' ? c.own.length + 40 + 8 : c.own.length;
      assert.equal(own.length, expectedOwn, `${id}: ${own.join(' | ')}`);
      for (const t of c.own) assert.ok(own.includes(t), `faltou ${t}`);
      assert.deepEqual(compat, [...c.compat].sort());
      for (const t of c.other) assert.ok(!mine.some((o) => o.title === t), `não deveria incluir ${t}`);
      assert.ok(!mine.some((o) => o.title === IRRELEVANT));
      // nenhum produto de outra marca cadastrada é atribuído a esta marca
      assert.ok(!mine.some((o) => Object.keys(o.brands).length > 1 && o.brands[id] === 'marca' && /Tipo|Para Samsung/.test(o.title)));
      // duplicados: o 1º produto aparece em várias consultas, mas é UMA oferta com várias fontes
      const first = Object.values(s.offers).filter((o) => o.title === c.own[0]);
      assert.equal(first.length, 1);
      assert.ok(first[0].sources.length >= 2, `${first[0].sources}`);
      const h = s.brandSearches[0];
      assert.equal(h.brand, id);
      const types = new Set(own.map((t) => t.split(' ')[0].toLowerCase()));
      report.push({ marca: id, consultas: h.sources, lidos: h.found, daMarca: h.kept, compativeis: h.compat, descartados: h.excluded, tiposDeProduto: types.size, categorias: Object.keys(h.categories).length, segundos: ((Date.now() - t0) / 1000).toFixed(0) });
      assert.ok(types.size >= 3, `diversidade ${[...types]}`);
    });
  }

  await check('paginação: Nike (página cheia com anúncios novos) pediu a página 2 no formato _Desde_N', async () => {
    assert.ok(hits.some((h) => /^\/nike_Desde_\d+_NoIndex_True$/.test(h.path)), hits.map((h) => h.path).filter((x) => x.startsWith('/nike')).join());
    assert.ok(!hits.some((h) => /^\/samsung_Desde_/.test(h.path)), 'Samsung (página pequena) não pagina');
  });

  await check('intervalo entre consultas ≥ 3 s (limites respeitados)', async () => {
    const t = hits.map((h) => h.t);
    for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] < 2900 && t[i] - t[i - 1] > 0) {
      // uma mesma consulta pode repetir só no fallback de aba; aqui não há fallback (leitura direta funciona)
      throw new Error(`intervalo ${t[i] - t[i - 1]} ms entre ${hits[i - 1].path} e ${hits[i].path}`);
    }
  });

  await check('interface: resultados organizados por categoria, filtros e ordenação', async () => {
    await p.fill('#brandInput', 'Samsung');
    await p.dispatchEvent('#brandInput', 'change');
    await p.waitForTimeout(400);
    const groups = await p.$$eval('#brandResults .cat-group h4', (h) => h.map((x) => x.textContent));
    assert.ok(groups.length >= 2, groups.join());
    const count = () => p.$$eval('#brandResults .offer', (l) => l.length);
    assert.equal(await count(), 5); // 5 produtos Samsung; compatíveis ocultos por padrão
    await p.check('#bCompat'); await p.waitForTimeout(200);
    assert.equal(await count(), 6);
    await p.uncheck('#bCompat');
    await p.fill('#bMax', '1000'); await p.waitForTimeout(200);
    const pr = await p.$$eval('#brandResults .o-price', (l) => l.map((x) => Number(x.textContent.replace(/\D/g, '')) / 100));
    assert.ok(pr.every((v) => v <= 1000) && pr.length < 5, pr.join());
    await p.fill('#bMax', '');
    await p.selectOption('#bSort', 'price'); await p.waitForTimeout(200);
    const sorted = await p.$$eval('#brandResults .cat-group:first-child .o-price', (l) => l.map((x) => Number(x.textContent.replace(/\D/g, ''))));
    assert.deepEqual(sorted, [...sorted].sort((a, b) => a - b));
    assert.match(await p.$eval('#brandSummary', (e) => e.innerText), /5 produto\(s\) da marca e 1 acessório/);
  });

  await check('marcas favoritas, monitoramento e histórico de buscas por marca', async () => {
    await p.click('#brandFav'); await p.waitForTimeout(300);
    assert.match(await p.$eval('#brandFavs', (e) => e.innerText), /★ Samsung/);
    await p.check('#brandMonitor'); await p.waitForTimeout(300);
    let s = await storage();
    assert.deepEqual(s.brandFavs, ['samsung']);
    assert.deepEqual(s.settings.monitorBrands, ['samsung']);
    assert.ok(s.brandSearches.length >= 11);
    assert.ok((await p.$$eval('#brandHistory li', (l) => l.length)) >= 11);
    // marca digitada (não cadastrada) entra no cadastro ao favoritar
    await p.fill('#brandInput', 'Havaianas'); await p.click('#brandFav'); await p.waitForTimeout(300);
    s = await storage();
    assert.equal(s.brands.havaianas.name, 'Havaianas');
    await p.click('#brandManager summary');
    assert.match(await p.$eval('#brandRegistry', (e) => e.innerText), /Havaianas/);
    // sugestões são só atalhos: clicar preenche a busca, NÃO cadastra
    await p.click('#brandSuggestions >> text=Philips'); await p.waitForTimeout(200);
    assert.equal(await p.inputValue('#brandInput'), 'Philips');
    assert.ok(!(await storage()).brands.philips);
  });

  await check('cadastro de marcas pela interface: cadastrar, editar e excluir', async () => {
    if (!(await p.$eval('#brandManager', (e) => e.open))) await p.click('#brandManager summary');
    await p.fill('#bfName', 'Boreal Teste');
    await p.fill('#bfAliases', 'boreal');
    await p.fill('#bfTerms', 'tenis, mochila');
    await p.click('#bfSave'); await p.waitForTimeout(400);
    let s = await storage();
    assert.deepEqual(s.brands['boreal-teste'].terms, ['tenis', 'mochila']);
    assert.match(await p.$eval('#bfMsg', (e) => e.innerText), /cadastrada/);
    // duplicado é recusado
    await p.fill('#bfName', 'boreal teste'); await p.click('#bfSave'); await p.waitForTimeout(300);
    assert.match(await p.$eval('#bfMsg', (e) => e.innerText), /Já existe/);
    await p.fill('#bfName', '');
    // editar
    await p.locator('#brandRegistry li', { hasText: 'Boreal Teste' }).locator('text=Editar').click();
    assert.equal(await p.inputValue('#bfName'), 'Boreal Teste');
    await p.fill('#bfTerms', 'tenis, mochila, bone');
    await p.click('#bfSave'); await p.waitForTimeout(400);
    s = await storage();
    assert.deepEqual(s.brands['boreal-teste'].terms, ['tenis', 'mochila', 'bone']);
    assert.match(await p.$eval('#bfMsg', (e) => e.innerText), /atualizada/);
    // excluir (com confirmação)
    p.once('dialog', (d) => d.accept());
    await p.locator('#brandRegistry li', { hasText: 'Boreal Teste' }).locator('text=Excluir').click();
    await p.waitForTimeout(400);
    s = await storage();
    assert.equal(s.brands['boreal-teste'], undefined);
    assert.doesNotMatch(await p.$eval('#brandRegistry', (e) => e.innerText), /Boreal Teste/);
  });

  await check('várias marcas monitoradas ao mesmo tempo (Samsung + Aurora pelo cadastro)', async () => {
    await p.fill('#brandInput', 'Aurora'); await p.waitForTimeout(400);
    assert.equal(await p.isChecked('#brandMonitor'), false, 'a caixa reflete a marca digitada, não a anterior');
    await p.check('#brandMonitor'); await p.waitForTimeout(400);
    const s = await storage();
    assert.deepEqual(s.settings.monitorBrands, ['samsung', 'aurora']);
    assert.match(await p.$eval('#brandMonitored', (e) => e.innerText), /Samsung[\s\S]*Aurora/);
  });

  await check('marca monitorada entra na varredura do radar (poucas consultas) e aparece nos destaques', async () => {
    hits.length = 0;
    await p.click('[data-tab=radar]');
    await p.click('#radarStart');
    const clickedAt = Date.now();
    await waitJob('radar', clickedAt);
    const sam = hits.filter((h) => /samsung/.test(h.path)).map((h) => h.path);
    assert.ok(sam.length >= 1 && sam.length <= 3, sam.join());
    const aur = hits.filter((h) => /aurora/.test(h.path)).map((h) => h.path);
    assert.ok(aur.length >= 1 && aur.length <= 3, aur.join()); // 2ª marca monitorada também consultada
    await p.waitForTimeout(500);
    assert.match(await p.$eval('#highlights', (e) => e.innerText), /Achados de marcas monitoradas[\s\S]*Samsung/i); // h3 em maiúsculas via CSS
  });

  await check('monitoramento periódico continua configurável (alarme)', async () => {
    await p.selectOption('#setInterval', '60'); await p.waitForTimeout(400);
    const a = await sw.evaluate(() => chrome.alarms.get('radar'));
    assert.equal(a && a.periodInMinutes, 60);
    await p.selectOption('#setInterval', '0');
  });

  await check('painel: filtro de classe padrão é "Qualquer classe" (não oculta ofertas)', async () => {
    await p.click('[data-tab=ofertas][data-group=""]');
    assert.equal(await p.inputValue('#oLabel'), '');
    const n = await p.$$eval('#offerList .offer', (l) => l.length);
    assert.ok(n > 40, String(n));
  });

  await check('relatório de classificação gera tabelas com dados armazenados', async () => {
    await p.click('[data-tab=historico]');
    await p.click('#reportBtn'); await p.waitForTimeout(500);
    const t = await p.$eval('#reportOut', (e) => e.innerText);
    assert.match(t, /ofertas armazenadas/);
    assert.match(t, /Classe nova/);
    assert.match(t, /Critério que penaliza/);
  });

  await check('sem erros de JavaScript', async () => assert.deepEqual(errors, []));
  await ctx.close();
  server.close();
  console.log('RELATÓRIO (SIMULADO):', JSON.stringify(report));
  for (const [s, n] of results) console.log(`${s.padEnd(6)} ${n}`);
  const failed = results.filter((r) => r[0] !== 'OK').length;
  console.log(`\n${results.length - failed}/${results.length} aprovados (REDE SIMULADA)`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
