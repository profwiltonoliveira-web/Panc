// E2E do caçador automático (v0.4) no Chromium, com a extensão real.
// ATENÇÃO: REDE SIMULADA. Um servidor HTTPS local responde pelos domínios do ML com páginas
// /ofertas SINTÉTICAS (formato "polycard"). Não são dados reais do Mercado Livre.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { execFileSync } = require('child_process');
const assert = require('assert/strict');
const EXT = path.resolve(__dirname, '..');
const DAY = 86400000;

const pc = (id, title, price, prev, { free = true, seller = 'Por Loja Teste', official = false } = {}) => ({
  polycard: {
    metadata: { id: `MLB${id}`, url: `produto.mercadolivre.com.br/MLB-${id}-x-_JM`, url_params: '#polycard_client=offers', ...(official ? { official_store_id: 1 } : {}) },
    pictures: { pictures: [{ id: `1-MLA${id}_012025` }] },
    components: [
      { type: 'title', title: { text: title } },
      { type: 'price', price: { current_price: { value: price }, ...(prev ? { previous_price: { value: prev } } : {}) } },
      ...(free ? [{ type: 'shipping', shipping: { text: 'Frete grátis' } }] : []),
      { type: 'seller', seller: { text: seller } }
    ]
  }
});
const BY_CAT = {
  MLB1051: [pc(7000000001, 'Smartphone Samsung Galaxy A15 128GB Azul', 899, 1299, { seller: 'Por Samsung', official: true }), pc(7000000002, 'Smartphone Samsung Galaxy A15 128GB Preto', 949, 1299), pc(7000000003, 'Capa Capinha Para Galaxy A15', 19.9, 49.9, { free: false })],
  MLB1000: [pc(7000000011, 'Smart TV 50 Polegadas 4K Samsung', 2199, 3299), pc(7000000012, 'Fone De Ouvido Bluetooth JBL Tune 520BT', 199, 349)],
  MLB5726: [pc(7000000021, 'Air Fryer Mondial 4L Preta', 299, 499), pc(7000000022, 'Liquidificador Arno 12 Velocidades', 159, 900)],
  MLB1430: [pc(7000000031, 'Tênis Nike Revolution 7 Masculino', 249, 399, { free: false })],
  MLB1246: [pc(7000000041, 'Perfume Masculino Malbec 100ml', 159, 229)]
};
const GENERAL = [BY_CAT.MLB1000[0], pc(7000000051, 'Furadeira De Impacto 650W Bosch', 279, 399)];
const page = (cards) => `<html><head><title>Ofertas | Mercado Livre</title></head><body><div id="root"></div>
<script id="__NORDIC_RENDERING_CTX__">_n.ctx.r=${JSON.stringify({ appProps: { pageProps: { data: { items: cards } } } })};</script></body></html>`;
const EMPTY = '<html><body><p>Não há anúncios que correspondam à sua busca.</p></body></html>';
// Página que só mostra os cards depois de JavaScript (para a leitura pela aba).
const clientPage = (cards) => `<html><head><title>Ofertas</title></head><body><main id="m"></main><script>setTimeout(()=>{document.getElementById('m').innerHTML=${JSON.stringify(cards.map(({ polycard: p }) =>
  `<div class="poly-card"><a class="poly-component__title" href="https://${p.metadata.url}">${p.components[0].title.text}</a><div class="poly-price__current"><span class="andes-money-amount"><span class="andes-money-amount__fraction">${Math.floor(p.components[1].price.current_price.value).toLocaleString('pt-BR')}</span></span></div></div>`).join(''))}},1200)</script></body></html>`;
const VERIFY = '<html><body>Confirme que você não é um robô</body></html>';

function selfSigned() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-e2e-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem')], { stdio: 'ignore' });
  return { key: fs.readFileSync(path.join(dir, 'k.pem')), cert: fs.readFileSync(path.join(dir, 'c.pem')) };
}

(async () => {
  let mode = 'direct';
  const hits = [];
  const server = https.createServer(selfSigned(), (req, res) => {
    const host = (req.headers.host || '').split(':')[0];
    const u = new URL(req.url, 'https://' + host);
    const isDoc = req.headers['sec-fetch-dest'] === 'document';
    const send = (st, body, h = {}) => { res.writeHead(st, { 'content-type': 'text/html; charset=utf-8', ...h }); res.end(body); };
    if (host === 'www.mercadolivre.com.br' && u.pathname === '/ofertas') {
      hits.push({ t: Date.now(), doc: isDoc, url: u.search, dest: req.headers['sec-fetch-dest'] });
      const cat = u.searchParams.get('category');
      const cards = cat ? BY_CAT[cat] : (u.searchParams.get('container_id') ? [BY_CAT.MLB1051[2]] : GENERAL);
      if (mode === 'direct') return send(200, cards ? page(cards) : EMPTY);
      if (!isDoc) return send(403, '<html><body>Hubo un error accediendo a esta pagina</body></html>');
      if (mode === 'tab') return send(200, cards ? clientPage(cards) : EMPTY);
      if (mode === 'verify') return send(302, '', { location: 'https://www.mercadolivre.com.br/gz/account-verification?go=x' });
    }
    if (u.pathname.startsWith('/gz/account-verification')) return send(200, VERIFY);
    return send(404, '');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true, ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-proxy-server', '--ignore-certificate-errors',
      `--host-resolver-rules=MAP *.mercadolivre.com.br 127.0.0.1:${port}, MAP api.mercadolibre.com 127.0.0.1:${port}, MAP *.mlstatic.com 127.0.0.1:${port}`]
  });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(sw.url().replace('background.js', 'app.html'));
  const results = [];
  const check = async (name, fn) => { try { await fn(); results.push(['OK', name]); } catch (e) { results.push(['FALHOU', name + ' — ' + e.message.split('\n')[0]]); } };
  const waitIdle = () => p.waitForFunction(() => /Atualizar|Iniciar Radar/.test(document.querySelector('#radarStart').textContent) && !document.querySelector('#radarStart').disabled, null, { timeout: 120000 });
  const storage = () => p.evaluate(() => chrome.storage.local.get(null));

  await check('"Iniciar Radar": leitura direta (offscreen) de todas as fontes, ofertas no painel', async () => {
    await p.click('#radarStart');
    await p.waitForFunction(() => /Radar em andamento/.test(document.querySelector('#radarStart').textContent), null, { timeout: 10000 });
    await waitIdle();
    const s = await storage();
    assert.equal(Object.keys(s.offers).length, 10, 'ofertas únicas');
    assert.ok(s.scans[0].sources.length >= 13);
    assert.ok(s.scans[0].sources.filter((x) => x.status === 'ok').every((x) => x.method === 'direta'));
    assert.ok(await p.$$eval('#topOffers .offer', (l) => l.length) > 0);
    const src = (await p.$eval('#radarSources', (e) => e.innerText)).replace(/\s+/g, ' ');
    assert.match(src, /✅ Ofertas: Celulares e telefones 3 anúncios, 2 únicos, 2 novos \(leitura direta\)/); // a capa já veio de "até R$ 100"
    assert.match(src, /⚪ Ofertas: Informática/); // categoria sem anúncios
  });

  await check('respeita limites: intervalo ≥ 3 s entre páginas', async () => {
    const t = hits.map((h) => h.t);
    for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] >= 2900, `intervalo ${t[i] - t[i - 1]} ms entre ${JSON.stringify(hits[i - 1])} e ${JSON.stringify(hits[i])}`);
  });

  await check('sem duplicados: TV vista em "todas" e em "Eletrônicos" vira 1 oferta com 2 fontes e categoria da página', async () => {
    const { offers } = await storage();
    const tv = offers.MLB7000000011;
    assert.deepEqual(tv.sources.sort(), ['cat-eletronicos', 'ofertas']);
    assert.equal(tv.category, 'eletronicos');
    assert.equal(offers.MLB7000000051.category, 'ferramentas'); // inferida pelo título (página geral)
  });

  await check('aba Eletrônicos mostra só eletrônicos; acessório marcado', async () => {
    await p.click('[data-tab=ofertas][data-group=eletronicos]');
    const titles = await p.$$eval('#offerList .o-title', (a) => a.map((x) => x.textContent));
    assert.equal(titles.length, 5);
    assert.ok(titles.every((t) => /Smartphone|Capa|TV|Fone/.test(t)), titles.join(' | '));
    assert.match(await p.$eval('#offerList', (e) => e.innerText), /acessório/);
  });

  await check('cartão mostra imagem, nome, preço, preço anterior, %, loja, link, classificação e "Copiar oferta"', async () => {
    const card = p.locator('#offerList .offer', { hasText: 'Galaxy A15 128GB Azul' });
    assert.equal(await card.locator('.o-price').innerText(), 'R$ 899,00');
    assert.equal(await card.locator('.o-prev').innerText(), 'de R$ 1.299,00');
    assert.equal(await card.locator('.o-disc').innerText(), '31% OFF em campanha do ML');
    assert.match(await card.locator('.o-meta').innerText(), /Samsung · loja oficial · Frete grátis/);
    assert.equal(await card.locator('.o-title').getAttribute('href'), 'https://produto.mercadolivre.com.br/MLB-7000000001-x-_JM');
    assert.match(await card.locator('img').getAttribute('src'), /^https:\/\/http2\.mlstatic\.com\//);
    // v0.6: loja oficial + página oficial de ofertas do ML + 31% OFF → evidência "campanha oficial do ML" → boa
    assert.equal(await card.locator('.badge').innerText(), 'Boa oportunidade');
    assert.equal(await card.locator('.disc-a').innerText(), 'Desconto em campanha oficial do ML');
    await card.locator('.o-copy').click();
    const txt = await p.evaluate(() => navigator.clipboard.readText());
    assert.match(txt, /🔥 Smartphone Samsung Galaxy A15 128GB Azul/);
    assert.match(txt, /De R\$ 1\.299,00 por R\$ 899,00 \(31% OFF em oferta do Mercado Livre\)/);
    assert.match(txt, /👉 https:\/\/produto\.mercadolivre\.com\.br\/MLB-7000000001-x-_JM/);
  });

  await check('filtros: desconto, frete grátis, preço, acessórios, qualidade', async () => {
    await p.click('[data-tab=ofertas][data-group=""]');
    const count = () => p.$$eval('#offerList .offer', (l) => l.length);
    assert.equal(await count(), 10);
    await p.check('#oAcc'); assert.equal(await count(), 9); await p.uncheck('#oAcc');
    await p.check('#oFree'); assert.equal(await count(), 8); await p.uncheck('#oFree');
    await p.fill('#oMax', '200'); assert.equal(await count(), 4); await p.fill('#oMax', '');
  });

  await check('filtro "≥ 30%" e "Só suspeitos" (liquidificador "de R$ 900" sem histórico = 82% → suspeito)', async () => {
    await p.selectOption('#oDisc', '30');
    const t30 = await p.$$eval('#offerList .o-title', (a) => a.map((x) => x.textContent));
    assert.ok(t30.length >= 4 && !t30.some((t) => /Liquidificador/.test(t)), t30.join(' | ')); // suspeito não exibe desconto
    await p.selectOption('#oDisc', '0');
    await p.selectOption('#oLabel', 'suspeito');
    assert.deepEqual(await p.$$eval('#offerList .o-title', (a) => a.map((x) => x.textContent)), ['Liquidificador Arno 12 Velocidades']);
    await p.selectOption('#oLabel', '');
  });

  await check('favoritar oferta → aparece em Favoritos', async () => {
    await p.locator('#offerList .offer', { hasText: 'Air Fryer' }).locator('.star').click();
    await p.waitForTimeout(200);
    await p.click('[data-tab=acompanhando]');
    await p.waitForTimeout(200);
    assert.match(await p.$eval('#watchList', (e) => e.innerText), /Air Fryer Mondial/);
  });

  await check('desconto comprovado: histórico de dias anteriores → "Excelente", texto diz "abaixo do preço médio"', async () => {
    await p.evaluate(({ DAY }) => chrome.storage.local.get('prices').then(({ prices }) => {
      prices.MLB7000000021.points.unshift({ t: Date.now() - 5 * DAY, price: 449 }, { t: Date.now() - 3 * DAY, price: 459 }, { t: Date.now() - 2 * DAY, price: 439 });
      return chrome.storage.local.set({ prices });
    }), { DAY });
    await p.click('[data-tab=radar]');
    await p.waitForTimeout(500);
    const card = p.locator('#topOffers .offer', { hasText: 'Air Fryer' });
    assert.equal(await card.locator('.badge').innerText(), 'Excelente oportunidade');
    assert.match(await card.locator('.o-disc').innerText(), /−33% comprovado/); // 299 vs média (449+459+439)/3 = 449
    assert.match(await card.locator('.o-prev').innerText(), /média observada R\$ 449,00/);
    await card.locator('.o-copy').click();
    assert.match(await p.evaluate(() => navigator.clipboard.readText()), /33% abaixo do preço médio que acompanhamos/);
  });

  await check('leitura direta bloqueada → leitura em janela minimizada (página montada por JS) e janela fechada ao fim', async () => {
    mode = 'tab';
    await p.evaluate(() => chrome.storage.local.set({ settings: { pages: 1, categories: ['celulares', 'eletronicos'], allowTabManual: true } }));
    const pagesBefore = ctx.pages().length;
    hits.length = 0;
    await p.click('#radarStart');
    await p.waitForFunction(() => /Radar em andamento/.test(document.querySelector('#radarStart').textContent), null, { timeout: 10000 });
    await waitIdle();
    const s = await storage();
    const ok = s.scans[0].sources.filter((x) => x.status === 'ok');
    assert.ok(ok.length >= 3, JSON.stringify(s.scans[0].sources.map((x) => [x.id, x.status, x.error])));
    assert.ok(ok.every((x) => x.method === 'aba'));
    assert.ok(hits.some((h) => h.doc) && hits.some((h) => !h.doc), 'tentou leitura direta e depois aba');
    await p.waitForTimeout(500);
    assert.equal(ctx.pages().length, pagesBefore, 'janela minimizada foi fechada');
  });

  await check('verificação de segurança: nada é contornado, varredura para, janela fica aberta e usuário é avisado', async () => {
    mode = 'verify';
    await p.click('#radarStart');
    await waitIdle();
    const s = await storage();
    assert.equal(s.scans[0].sources.filter((x) => x.status === 'bloqueado').length, 1);
    assert.match(s.scans[0].stoppedReason || '', /verificação\/bloqueio/);
    assert.ok(s.radarState.needsUser);
    const st = await p.$eval('#radarStatus', (e) => e.innerText);
    assert.match(st, /verificação de segurança/);
    assert.match(st, /Ir para a janela do Mercado Livre/);
    await p.click('text=Copiar diagnóstico');
    const d = JSON.parse(await p.evaluate(() => navigator.clipboard.readText()));
    assert.ok(d.varredura.sources.some((x) => x.diagnostic && x.diagnostic.tipoDePagina === 'verificacao'));
  });

  await check('ofertas anteriores continuam no painel após varredura bloqueada (não some nada, não inventa nada)', async () => {
    const { offers } = await storage();
    assert.equal(Object.keys(offers).length, 10);
  });

  await check('v0.5: página 2 de fonte pouco produtiva é pulada sem requisição', async () => {
    mode = 'direct';
    await p.evaluate(() => chrome.storage.local.set({ settings: { pages: 2, categories: ['celulares'], allowTabManual: true }, backoff: {} }));
    hits.length = 0;
    await p.click('[data-tab=radar]');
    await p.click('#radarStart');
    await p.waitForFunction(() => /Radar em andamento/.test(document.querySelector('#radarStart').textContent), null, { timeout: 10000 });
    await waitIdle();
    const sc = (await storage()).scans[0];
    const p2 = sc.sources.filter((x) => /-p2$/.test(x.id));
    assert.equal(p2.length, 2);
    assert.ok(p2.every((x) => x.status === 'pulada' && /pouco produtiva/.test(x.error)), JSON.stringify(p2));
    assert.ok(!hits.some((h) => /page=2/.test(h.url)), 'nenhuma requisição de página 2');
    assert.match(await p.$eval('#radarStatus', (e) => e.innerText), /pulada\(s\) por baixa produtividade/);
  });

  await check('monitoramento periódico: configuração cria alarme (mín. 30 min) e desligar remove', async () => {
    await p.selectOption('#setInterval', '60');
    await p.waitForTimeout(500);
    let a = await sw.evaluate(() => chrome.alarms.get('radar'));
    assert.equal(a && a.periodInMinutes, 60);
    await p.selectOption('#setInterval', '0');
    await p.waitForTimeout(500);
    a = await sw.evaluate(() => chrome.alarms.get('radar'));
    assert.ok(!a);
  });

  await check('histórico mostra varreduras', async () => {
    await p.click('[data-tab=historico]');
    await p.waitForTimeout(300);
    assert.ok((await p.$$eval('#scanHistory li', (l) => l.length)) >= 3);
  });

  await check('v0.5: auditoria de fontes (consultas, únicos, acessórios) e uso de armazenamento', async () => {
    await p.waitForSelector('#sourceAudit tr:nth-child(2)');
    const txt = await p.$eval('#sourceAudit', (e) => e.innerText);
    assert.match(txt, /Ofertas: Celulares e telefones/);
    const { sourceStats } = await storage();
    const cel = sourceStats['cat-celulares'];
    assert.ok(cel.runs >= 1 && cel.items >= 3 && cel.accessories >= 1, JSON.stringify(cel));
    // 1ª varredura: Eletrônicos trouxe 2 anúncios, mas a TV já tinha vindo da página geral → 1 único
    const first = (await storage()).scans.at(-1).sources.find((x) => x.id === 'cat-eletronicos');
    assert.deepEqual([first.count, first.unique], [2, 1]);
    assert.match(await p.$eval('#storageInfo', (e) => e.innerText), /Em uso: .* MB de 10\.00 MB/);
  });

  await check('v0.5: card mostra sinal de preço e subnotas separadas', async () => {
    await p.click('[data-tab=ofertas][data-group=""]');
    const card = p.locator('#offerList .offer', { hasText: 'Galaxy A15 128GB Azul' });
    assert.match(await card.locator('.o-sub').innerText(), /Desconto real \(A\): \d+\/100 · Atratividade do preço \(B\): (sem referência|\d+\/100) \(\d+ equivalentes?\)/);
  });

  await check('v0.5: pesos configuráveis alteram a nota e são salvos', async () => {
    await p.click('[data-tab=radar]');
    await p.click('.weights summary');
    const card = () => p.locator('#topOffers .offer', { hasText: 'Galaxy A15 128GB Azul' }).locator('.o-score').innerText();
    const before = await card();
    await p.fill('#w-desconto', '100'); await p.press('#w-desconto', 'Tab');
    await p.waitForTimeout(500);
    const after = await card();
    assert.notEqual(before, after);
    assert.equal((await storage()).settings.weights.desconto, 100);
    await p.click('#weightsReset');
    await p.waitForTimeout(300);
    assert.equal(await p.inputValue('#w-desconto'), '35');
  });

  await check('busca manual continua disponível', async () => {
    await p.click('[data-tab=buscar]');
    assert.ok(await p.isVisible('#q'));
  });

  await check('sem erros de JavaScript', async () => assert.deepEqual(errors, []));
  await ctx.close();
  server.close();
  for (const [s, n] of results) console.log(`${s.padEnd(6)} ${n}`);
  const failed = results.filter((r) => r[0] !== 'OK').length;
  console.log(`\n${results.length - failed}/${results.length} aprovados (REDE SIMULADA)`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
