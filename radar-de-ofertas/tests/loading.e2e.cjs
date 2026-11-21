// E2E v0.5.1: espera inteligente pelo carregamento dinâmico da página de busca.
// ATENÇÃO: REDE SIMULADA com páginas SINTÉTICAS (servidor HTTPS local). Elas imitam o
// comportamento visto no diagnóstico real do usuário (HTML com tela de carregamento
// "ui-search-loading-screen" e anúncios montados depois por JavaScript), mas NÃO são o site
// real. Estes testes validam o mecanismo de espera, não a integração com o Mercado Livre.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { execFileSync } = require('child_process');
const assert = require('assert/strict');
const EXT = path.resolve(__dirname, '..');

const LOADING = '<div class="ui-search-loading-screen"><div class="ui-search-loading-screen__spinner andes-spinner"></div><div class="ui-search-loading-screen__content">Carregando…</div></div>';
const card = (id, title, price) => `<li class="ui-search-layout__item"><div class="poly-card"><h3><a class="poly-component__title" href="https://produto.mercadolivre.com.br/MLB-${id}-x-_JM">${title}</a></h3><div class="poly-price__current"><span class="andes-money-amount"><span class="andes-money-amount__fraction">${price}</span></span></div><div>Frete grátis</div></div></li>`;
const CARDS = [card(8100000001, 'Perfume 212 VIP Black Masculino 100ml', '399'), card(8100000002, 'Perfume 212 VIP Black 50ml', '289'), card(8100000003, 'Perfume 212 Vip Black Edp 200ml', '599')].join('');
const page = (body, head = '') => `<!doctype html><html><head><title>212 vip black | Mercado Livre</title>${head}</head><body><input class="nav-search-input" value="212 vip black">${body}</body></html>`;
// Página que mostra a tela de carregamento e monta os anúncios após `ms` (como o ML faz).
const delayed = (ms) => page(`<main id="root">${LOADING}</main><script>setTimeout(() => { document.getElementById('root').innerHTML = '<ol class="ui-search-layout">' + ${JSON.stringify(CARDS)} + '</ol>'; }, ${ms});</script>`);
const NEVER = page(`<main id="root">${LOADING}</main><script>setInterval(() => { document.querySelector('.andes-spinner').classList.toggle('andes-spinner--pulse'); }, 500);</script>`);
const NORMAL = page(`<ol class="ui-search-layout">${CARDS}</ol>`);
const BLOCK = '<html><head><title>Mercado Libre</title></head><body>Hubo un error accediendo a esta pagina... <a href="/">Ir a la página principal</a></body></html>';
const EMPTY = page('<div class="ui-search-rescue"><p>Não há anúncios que correspondam à sua busca.</p></div>');
const NEW_LAYOUT = page('<main><section class="layout-novo-xyz"><p>Produtos</p></section></main>');
const VERIFY = '<html><body>Confirme que você não é um robô</body></html>';
// Estado "Nordic" com resultados em formato genérico (sem "polycard"), na leitura direta.
const NORDIC = page(LOADING, `<script id="__NORDIC_RENDERING_CTX__">_n.ctx.r=${JSON.stringify({ appProps: { pageProps: { initialState: { results: [
  { id: 'MLB8200000001', title: 'Perfume 212 VIP Black 100ml', price: { amount: 399.9 }, permalink: 'https://produto.mercadolivre.com.br/MLB-8200000001-perfume-_JM', shipping: { free_shipping: true } },
  { id: 'MLB8200000002', title: 'Perfume 212 VIP Black 50ml', price: 289, permalink: 'produto.mercadolivre.com.br/MLB-8200000002-perfume-_JM' },
  { id: 'MLB8200000003', title: 'Golpe', price: 10, permalink: 'https://evil.example.com/MLB-8200000003' }
] } } } })};</script>`);

function selfSigned() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-e2e-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem')], { stdio: 'ignore' });
  return { key: fs.readFileSync(path.join(dir, 'k.pem')), cert: fs.readFileSync(path.join(dir, 'c.pem')) };
}

(async () => {
  const server = https.createServer(selfSigned(), (req, res) => {
    const host = (req.headers.host || '').split(':')[0];
    const u = new URL(req.url, 'https://' + host);
    const isDoc = req.headers['sec-fetch-dest'] === 'document';
    const send = (st, body, h = {}) => { res.writeHead(st, { 'content-type': 'text/html; charset=utf-8', ...h }); res.end(body); };
    if (host === 'api.mercadolibre.com') return send(403, '{"message":"forbidden"}');
    if (host === 'lista.mercadolivre.com.br') {
      const slug = u.pathname.slice(1);
      // Leitura direta (fetch): HTML inicial, sem JavaScript executado → só a tela de carregamento.
      if (!isDoc) {
        if (slug === 'estado-nordic') return send(200, NORDIC);
        if (slug === 'bloqueio') return send(403, BLOCK);
        if (slug === 'sem-resultados') return send(200, EMPTY);
        return send(200, page(`<main id="root">${LOADING}</main>`));
      }
      if (slug === 'carrega-normal') return send(200, NORMAL);
      if (slug === 'carrega-3s') return send(200, delayed(3000));
      if (slug === 'carrega-12s') return send(200, delayed(12000));
      if (slug === 'carrega-nunca') return send(200, NEVER);
      if (slug === 'bloqueio') return send(200, BLOCK);
      if (slug === 'sem-resultados') return send(200, EMPTY);
      if (slug === 'layout-novo') return send(200, NEW_LAYOUT);
      if (slug === 'verificacao') return send(302, '', { location: 'https://www.mercadolivre.com.br/gz/account-verification?go=x' });
    }
    if (u.pathname.startsWith('/gz/account-verification')) return send(200, VERIFY);
    return send(404, '');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true, ignoreHTTPSErrors: true, viewport: { width: 1200, height: 900 },
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
  await p.click('[data-tab=buscar]');

  const results = [];
  const check = async (name, fn) => { const t = Date.now(); try { await fn(); results.push(['OK', `${name} (${((Date.now() - t) / 1000).toFixed(1)} s)`]); } catch (e) { results.push(['FALHOU', name + ' — ' + e.message.split('\n')[0]]); } };
  const search = async (q) => { await p.fill('#q', q); await p.click('#searchBtn'); };
  const finalState = () => p.waitForFunction(() => document.querySelector('.card') || /Copiar diagnóstico/.test(document.querySelector('#status').innerText), null, { timeout: 90000 });
  const diag = async () => {
    await p.click('text=Copiar diagnóstico');
    const d = JSON.parse(await p.evaluate(() => navigator.clipboard.readText()));
    return d.diagnosticos.find((x) => x.origem === 'aba') || d.diagnosticos[d.diagnosticos.length - 1];
  };
  const statusText = () => p.$eval('#status', (e) => e.innerText);

  await check('anúncios carregados normalmente: lidos de imediato', async () => {
    await search('carrega normal'); await finalState();
    assert.equal(await p.$$eval('.card', (c) => c.length), 3);
    assert.match(await p.$eval('#summary', (e) => e.innerText), /Aba do Mercado Livre/);
  });

  await check('tela de carregamento inicial → anúncios após 3 s: espera e lê', async () => {
    await search('carrega 3s'); await finalState();
    assert.equal(await p.$$eval('.card', (c) => c.length), 3);
  });

  await check('anúncios após 12 s (além do antigo limite de 8 s): espera e lê', async () => {
    const t = Date.now();
    await search('carrega 12s'); await finalState();
    assert.equal(await p.$$eval('.card', (c) => c.length), 3);
    assert.ok(Date.now() - t >= 12000, 'esperou o carregamento');
  });

  await check('página que nunca termina de carregar: para em 30 s com estado "carregando"', async () => {
    const t = Date.now();
    await search('carrega nunca'); await finalState();
    const el = Date.now() - t;
    assert.equal(await p.$$eval('.card', (c) => c.length), 0);
    assert.match(await statusText(), /tela de carregamento por \d+ s/);
    const d = await diag();
    assert.equal(d.tipoDePagina, 'carregando');
    console.log('MEDIÇÃO (simulada):', JSON.stringify(d.espera));
    assert.equal(d.espera.estadoFinal, 'carregando');
    assert.ok(d.espera.ms >= 29000 && d.espera.ms <= 32000, `espera ${d.espera.ms} ms`);
    assert.ok(d.espera.verificacoes >= 25, `verificações ${d.espera.verificacoes}`);
    assert.ok(d.espera.mutacoes > 0, 'MutationObserver registrou mudanças');
    assert.ok(d.elementos.telaDeCarregamento > 0);
    assert.ok(el < 75000, `tempo total ${el} ms`);
    // aba em segundo plano: o usuário recebe a instrução e o botão para ir à aba
    if (d.espera.visibilidadeFinal === 'hidden') assert.match(await statusText(), /segundo plano[\s\S]*Ir para a aba do ML/);
  });

  await check('página de bloqueio: identificada sem esperar o limite', async () => {
    const t = Date.now();
    await search('bloqueio'); await finalState();
    assert.match(await statusText(), /bloqueou o acesso/);
    const d = await diag();
    assert.equal(d.tipoDePagina, 'bloqueio');
    assert.ok(Date.now() - t < 15000);
  });

  await check('página sem resultados: identificada (leitura direta já reconhece; aba não é aberta à toa)', async () => {
    const t = Date.now();
    await search('sem resultados'); await finalState();
    assert.match(await statusText(), /não encontrou anúncios/);
    assert.ok(Date.now() - t < 15000);
  });

  await check('verificação de segurança: identificada, nada é contornado', async () => {
    await search('verificacao'); await finalState();
    assert.match(await statusText(), /verificação de segurança/);
    assert.equal((await diag()).tipoDePagina, 'verificacao');
  });

  await check('layout desconhecido: identificado quando a página para de mudar (~5 s), não no limite de 30 s', async () => {
    const t = Date.now();
    await search('layout novo'); await finalState();
    const d = await diag();
    assert.equal(d.tipoDePagina, 'desconhecida');
    assert.ok(d.espera.ms >= 5000 && d.espera.ms < 15000, `espera ${d.espera.ms}`);
    assert.ok(Date.now() - t < 30000);
  });

  await check('leitura direta: tela de carregamento é diagnosticada como "carregando" (não como layout desconhecido)', async () => {
    await search('carrega 3s'); await finalState(); // termina com resultados pela aba
    const d = await p.evaluate(async () => {
      const r = await fetch('https://lista.mercadolivre.com.br/carrega-3s');
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      return globalThis.RadarML.diagnoseDocument(doc, {});
    });
    assert.equal(d.tipoDePagina, 'carregando');
    assert.ok(d.elementos.telaDeCarregamento >= 1);
  });

  await check('estado "Nordic" em formato genérico: anúncios lidos na leitura direta (estratégia "estado"); link externo descartado', async () => {
    await search('estado nordic'); await finalState();
    assert.equal(await p.$$eval('.card', (c) => c.length), 2);
    assert.match(await p.$eval('#summary', (e) => e.innerText), /leitura direta, estratégia estado/);
  });

  await check('sem erros de JavaScript no painel', async () => assert.deepEqual(errors, []));
  await ctx.close();
  server.close();
  for (const [s, n] of results) console.log(`${s.padEnd(6)} ${n}`);
  const failed = results.filter((r) => r[0] !== 'OK').length;
  console.log(`\n${results.length - failed}/${results.length} aprovados (REDE SIMULADA)`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
