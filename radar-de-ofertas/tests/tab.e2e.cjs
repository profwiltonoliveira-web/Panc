// Teste e2e da coleta v0.3 (leitura direta com JSON embutido, fallback para aba, "Ler aba do ML", diagnóstico).
// ATENÇÃO: REDE SIMULADA com HTML SINTÉTICO. Não são dados reais do Mercado Livre.
// A página de "resultados" simulada monta os cards via JavaScript após 1,5 s, como uma página
// renderizada no cliente — isso testa a espera da leitura na aba.

const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert/strict');
const EXT = path.resolve(__dirname, '..');

const pc = (id, title, price, prev) => ({
  polycard: {
    metadata: { id: `MLB${id}`, url: `produto.mercadolivre.com.br/MLB-${id}-x-_JM`, url_params: '#polycard_client=search' },
    pictures: { pictures: [{ id: `1-MLA${id}_012025` }] },
    components: [
      { type: 'title', title: { text: title } },
      { type: 'price', price: { current_price: { value: price, currency: 'BRL' }, ...(prev ? { previous_price: { value: prev } } : {}) } },
      { type: 'shipping', shipping: { text: 'Frete grátis' } }
    ]
  }
});
const CARDS = [
  pc(5100000001, 'Samsung Galaxy S25 256GB 12GB RAM Azul', 4299.9, 6999),
  pc(5100000002, 'Samsung Galaxy S25 256GB Preto', 4399),
  pc(5100000003, 'Samsung Galaxy S25 256GB Gelo', 4499),
  pc(5100000004, 'Capa Para Samsung Galaxy S25 256GB', 39.9)
];
// Página só com JSON embutido (cards montados no cliente) — caso da leitura direta.
const JSON_ONLY = `<html><head><title>Samsung galaxy s25 256gb | MercadoLivre</title></head><body><div id="root"></div>
<script id="__NORDIC_RENDERING_CTX__">_n.ctx.r=${JSON.stringify({ appProps: { pageProps: { initialState: { results: CARDS } } } })};</script></body></html>`;
// Página "real" na aba: cards aparecem só após JS (1,5 s), e os links não têm classes conhecidas.
const CLIENT_RENDERED = `<html><head><title>Samsung galaxy s25 256gb | MercadoLivre</title></head><body>
<input class="nav-search-input" value="Samsung Galaxy S25 256GB"><main id="m"></main>
<script>setTimeout(() => {
  document.getElementById('m').innerHTML = ${JSON.stringify(CARDS.map(({ polycard: p }) =>
    `<section class="x-novo"><a href="https://${p.metadata.url}">${p.components[0].title.text}</a><div class="y"><span>R$ ${String(p.components[1].price.current_price.value).replace('.', ',')}</span></div><p>Frete grátis</p></section>`).join(''))};
}, 1500);</script></body></html>`;
const VERIFY = '<html><head><title>Mercado Livre</title></head><body>Confirme que você não é um robô</body></html>';

// Servidor HTTPS local que responde por TODOS os hosts do ML (via --host-resolver-rules).
// Funciona também para abas criadas pela extensão, que o roteamento do Playwright não intercepta.
const https = require('https');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
function selfSigned() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-e2e-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem')], { stdio: 'ignore' });
  return { key: fs.readFileSync(path.join(dir, 'k.pem')), cert: fs.readFileSync(path.join(dir, 'c.pem')) };
}

(async () => {
  let mode = 'json';
  const nav = [];
  const server = https.createServer(selfSigned(), (req, res) => {
    const host = (req.headers.host || '').split(':')[0];
    const u = new URL(req.url, 'https://' + host);
    const isDoc = req.headers['sec-fetch-dest'] === 'document';
    const send = (status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers }); res.end(body); };
    if (host === 'api.mercadolibre.com') return send(403, '{"message":"forbidden"}', { 'content-type': 'application/json' });
    if (host === 'lista.mercadolivre.com.br') {
      if (isDoc) nav.push(u.pathname);
      if (mode === 'json') return send(200, JSON_ONLY);
      if (!isDoc) return send(403, '<html><body>Hubo un error</body></html>'); // fetch bloqueado
      if (mode === 'tab') return send(200, CLIENT_RENDERED);
      if (mode === 'tab-verify') return send(302, '', { location: 'https://www.mercadolivre.com.br/gz/account-verification?go=x' });
    }
    if (u.pathname.startsWith('/gz/account-verification')) return send(200, VERIFY);
    return send(404, '');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true, ignoreHTTPSErrors: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-proxy-server', '--ignore-certificate-errors',
      `--host-resolver-rules=MAP *.mercadolivre.com.br 127.0.0.1:${port}, MAP api.mercadolibre.com 127.0.0.1:${port}, MAP *.mlstatic.com 127.0.0.1:${port}`],
    viewport: { width: 600, height: 900 }
  });

  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(sw.url().replace('background.js', 'app.html'));
  const results = [];
  const check = async (name, fn) => {
    try { await fn(); results.push(['OK', name]); } catch (e) { results.push(['FALHOU', name + ' — ' + e.message.split('\n')[0]]); }
  };
  const titles = () => page.$$eval('.card .title', (a) => a.map((x) => x.textContent));
  const search = async (q) => { await page.fill('#q', q); await page.click('#searchBtn'); };

  await check('leitura direta: anúncios extraídos do JSON embutido (cards montados via JS)', async () => {
    await search('samsung galaxy s25 256gb');
    await page.waitForSelector('.card', { timeout: 15000 });
    assert.match(await page.$eval('#summary', (e) => e.innerText), /leitura direta, estratégia json/);
    const t = await titles();
    assert.equal(t.length, 4);
    assert.equal(await page.$eval('.card .price', (e) => e.textContent), 'R$ 4.299,90');
    assert.match(await page.$eval('.card .title', (e) => e.href), /MLB-5100000001/);
  });

  mode = 'tab';
  await check('leitura direta bloqueada → aba em 2º plano → anúncios lidos (espera renderização)', async () => {
    const before = ctx.pages().length;
    await search('samsung galaxy s25 256gb');
    await page.waitForSelector('.card', { timeout: 40000 });
    assert.match(await page.$eval('#summary', (e) => e.innerText), /Aba do Mercado Livre aberta no navegador \(estratégia links\)/);
    assert.equal((await titles()).length, 4);
    assert.ok(nav.includes('/samsung-galaxy-s25-256gb'), 'aba abriu a URL de busca do termo');
    await page.waitForTimeout(300);
    assert.equal(ctx.pages().length, before, 'aba criada pela extensão foi fechada após a leitura');
  });

  await check('equivalência aplicada aos dados da aba (capa marcada como produto diferente)', async () => {
    const other = await page.$$eval('.card.other .title', (a) => a.map((x) => x.textContent));
    assert.deepEqual(other, ['Capa Para Samsung Galaxy S25 256GB']);
  });

  await check('"Ler aba do ML": lê a página de resultados aberta pelo usuário e usa o termo dela', async () => {
    const ml = await ctx.newPage();
    await ml.goto('https://lista.mercadolivre.com.br/samsung-galaxy-s25-256gb');
    await page.bringToFront();
    await page.fill('#q', '');
    await page.click('#readTab');
    await page.waitForSelector('.card', { timeout: 20000 });
    assert.equal(await page.inputValue('#q'), 'Samsung Galaxy S25 256GB');
    assert.equal((await titles()).length, 4);
    await ml.close();
  });

  mode = 'tab-verify';
  await check('verificação na aba: nada é contornado; aba fica aberta e usuário recebe instrução', async () => {
    const before = ctx.pages().length;
    await search('samsung galaxy s25 128gb');
    await page.waitForFunction(() => /verificação de segurança/.test(document.querySelector('#status').innerText), null, { timeout: 40000 });
    const t = await page.$eval('#status', (e) => e.innerText);
    assert.match(t, /Conclua a verificação nessa aba/);
    assert.match(t, /Ir para a aba do ML/);
    assert.equal(await page.$$eval('.card', (c) => c.length), 0);
    assert.equal(ctx.pages().length, before + 1, 'aba de verificação continua aberta');
  });

  await check('diagnóstico: botão copia JSON estrutural sem conteúdo da página', async () => {
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.click('text=Copiar diagnóstico');
    const txt = await page.evaluate(() => navigator.clipboard.readText());
    const d = JSON.parse(txt);
    assert.equal(d.radarDeOfertas, '0.3.0');
    const kinds = d.diagnosticos.map((x) => x.tipoDePagina);
    assert.ok(kinds.includes('verificacao'), JSON.stringify(kinds));
    assert.ok(d.diagnosticos.some((x) => x.origem === 'aba'));
    assert.ok(!/robô/.test(txt), 'não inclui texto da página');
  });

  await check('sem erros de JavaScript', async () => assert.deepEqual(errors, []));
  await ctx.close();
  server.close();
  for (const [s, n] of results) console.log(`${s.padEnd(6)} ${n}`);
  const failed = results.filter((r) => r[0] !== 'OK').length;
  console.log(`\n${results.length - failed}/${results.length} aprovados (REDE SIMULADA)`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
