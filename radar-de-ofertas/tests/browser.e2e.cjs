// Teste de ponta a ponta da extensão no Chromium (Playwright).
// ATENÇÃO: a REDE É SIMULADA. As respostas do Mercado Livre abaixo são HTML SINTÉTICO,
// escrito no formato dos cards "poly-card" do site; não são dados reais.
// Valida: carregamento MV3, fallback API→página, parser, links, equivalência,
// classificação com histórico, favoritos/acompanhamento, persistência, poda e erros.
//
// Uso: node tests/browser.e2e.cjs   (requer o pacote "playwright" e o Chromium dele)

const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert/strict');

const EXT = path.resolve(__dirname, '..');
const DAY = 86400000;

const money = (v) => {
  const [i, c] = v.split(',');
  return `<span class="andes-money-amount"><span class="andes-money-amount__currency-symbol">R$</span><span class="andes-money-amount__fraction">${i}</span>${c ? `<span class="andes-money-amount__cents">${c}</span>` : ''}</span>`;
};
// Card sintético. O link da IMAGEM aponta para a loja oficial (antes do título no DOM)
// para garantir que o link usado seja o do TÍTULO.
const card = ({ href, title, price, prev, free, used, inst }) => `
<li class="ui-search-layout__item"><div class="poly-card">
  <div class="poly-card__portada"><a href="https://www.mercadolivre.com.br/loja/oficial"><img class="poly-component__picture" data-src="https://http2.mlstatic.com/D_${title.length}-O.webp" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></a></div>
  <div class="poly-card__content">
    <span class="poly-component__seller">Por Loja Teste</span>
    <h3 class="poly-component__title-wrapper"><a class="poly-component__title" href="${href}">${title}</a></h3>
    ${used ? '<span class="poly-component__item-condition">Usado</span>' : ''}
    <div class="poly-component__price">
      ${prev ? `<s class="andes-money-amount andes-money-amount--previous"><span class="andes-money-amount__fraction">${prev}</span></s>` : ''}
      <div class="poly-price__current">${money(price)}</div>
      ${inst ? `<span class="poly-price__installments">em 12x ${money(inst)}</span>` : ''}
    </div>
    ${free ? '<div class="poly-component__shipping">Frete grátis</div>' : ''}
    <img src="https://tracker.example.com/pixel.gif">
  </div></div></li>`;

const P = (id) => `https://produto.mercadolivre.com.br/MLB-${id}-titulo-_JM`;
const RESULTS = [
  card({ href: P(1000000001), title: 'Apple iPhone 13 (128 GB) - Meia-noite', price: '3.199,00', free: true, inst: '266,58' }),
  card({ href: P(1000000002), title: 'Apple iPhone 13 (128 GB) - Azul', price: '3.399,00', prev: '4.999', free: true }),
  card({ href: P(1000000003), title: 'Apple iPhone 13 (128 GB) - Estelar', price: '3.299,00', free: true }),
  card({ href: 'https://www.mercadolivre.com.br/apple-iphone-13-128-gb-rosa/p/MLB1018500853?wid=MLB1000000004', title: 'Apple iPhone 13 (128 GB) - Rosa', price: '3.249,90' }),
  card({ href: P(1000000005), title: 'Apple iPhone 13 Pro Max (256 GB) - Grafite', price: '5.499,00', free: true }),
  card({ href: P(1000000006), title: 'Apple iPhone 13 (128 GB) - Vermelho', price: '2.499,00', used: true }),
  card({ href: P(1000000007), title: 'Capa Capinha Silicone Para iPhone 13', price: '29,90' }),
  card({ href: 'https://click1.mercadolivre.com.br/mclics/clicks/external/MLB/count?a=xyz', title: 'Apple iPhone 13 (128 GB) - Verde', price: '3.350,00' }),
  card({ href: 'https://evil.example.com/MLB-1000000009', title: 'Apple iPhone 13 Golpe', price: '999,00' })
].join('');
const HTML_OK = `<html><body><ol class="ui-search-layout">${RESULTS}</ol></body></html>`;

(async () => {
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    viewport: { width: 600, height: 900 }
  });
  let mode = 'ok';
  const hosts = [];
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.protocol === 'chrome-extension:' || u.protocol === 'data:') return r.continue();
    hosts.push(u.hostname);
    if (u.hostname === 'api.mercadolibre.com') return r.fulfill({ status: 403, body: '{"message":"forbidden","error":"forbidden","status":403,"cause":[]}' });
    if (u.hostname === 'lista.mercadolivre.com.br') {
      if (mode === 'verify') return r.fulfill({ status: 302, headers: { location: 'https://www.mercadolivre.com.br/gz/account-verification?go=x' } });
      if (mode === 'layout') return r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body><div class="novo-layout">iPhone</div></body></html>' });
      return r.fulfill({ status: 200, contentType: 'text/html', body: HTML_OK });
    }
    if (u.pathname.startsWith('/gz/account-verification')) return r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>account-verification suspicious</body></html>' });
    return r.fulfill({ status: 404, body: '' });
  });

  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const url = `chrome-extension://${id}/app.html`;
  await page.goto(url);
  await page.click('[data-tab=buscar]'); // v0.4: a tela inicial é o painel do radar
  const results = [];
  const check = async (name, fn) => {
    try { await fn(); results.push(['OK', name]); } catch (e) { results.push(['FALHOU', name + ' — ' + e.message.split('\n')[0]]); }
  };

  // Histórico prévio sintético para o MLB1000000001 (para testar classificação com evidência)
  // e preço "de" nunca observado para o MLB1000000002.
  await page.evaluate(({ DAY }) => chrome.storage.local.set({ prices: {
    MLB1000000001: { title: 'x', link: 'https://produto.mercadolivre.com.br/MLB-1000000001', points: [
      { t: Date.now() - 5 * DAY, price: 3799 }, { t: Date.now() - 3 * DAY, price: 3699 }, { t: Date.now() - 1 * DAY, price: 3749 }] },
    MLB1000000002: { title: 'x', link: 'https://produto.mercadolivre.com.br/MLB-1000000002', points: [
      { t: Date.now() - 4 * DAY, price: 3399 }, { t: Date.now() - 2 * DAY, price: 3449 }] }
  } }), { DAY });

  await page.fill('#q', 'iphone 13');
  await page.click('#searchBtn');
  await page.waitForSelector('.card', { timeout: 10000 });
  const cards = await page.$$eval('.card', (cs) => cs.map((c) => ({
    title: c.querySelector('.title').textContent,
    href: c.querySelector('.title').href,
    thumb: c.querySelector('.thumb').href,
    img: c.querySelector('img') ? c.querySelector('img').getAttribute('src') : null,
    price: c.querySelector('.price').textContent,
    badge: c.querySelector('.badge').textContent,
    meta: c.querySelector('.meta').textContent,
    why: c.querySelector('.why').textContent,
    other: c.classList.contains('other'),
    best: c.classList.contains('best'),
    starDisabled: c.querySelector('.star').disabled
  })));
  const by = (t) => cards.find((c) => c.title.includes(t));

  await check('fallback: API 403 → página pública; fonte exibida', async () => {
    assert.match(await page.$eval('#summary', (e) => e.innerText), /Página pública de busca/);
  });
  await check('anúncio com link fora do ML é descartado', async () => assert.equal(by('Golpe'), undefined));
  await check('link do card = link do título (não o da loja/imagem)', async () => {
    for (const c of cards) { assert.equal(c.thumb, c.href); assert.ok(!c.href.includes('/loja/oficial'), c.title); }
    assert.equal(by('Meia-noite').href, P(1000000001));
    assert.match(by('Rosa').href, /wid=MLB1000000004/);
  });
  await check('preço atual não é confundido com parcela nem preço "de"', async () => {
    assert.equal(by('Meia-noite').price, 'R$ 3.199,00');
    assert.equal(by('Azul').price, 'R$ 3.399,00');
  });
  await check('imagens só do CDN mlstatic (pixel de terceiro ignorado)', async () => {
    for (const c of cards) if (c.img) assert.match(c.img, /^https:\/\/http2\.mlstatic\.com\//);
    assert.ok(!hosts.includes('tracker.example.com'), 'pixel de rastreamento foi requisitado');
  });
  await check('acessório marcado como não equivalente e listado no fim', async () => {
    assert.ok(by('Capa').other);
    assert.match(by('Capa').meta, /Produto diferente/);
    assert.ok(cards[cards.length - 1].title.includes('Capa') || cards.slice(-2).some((c) => c.title.includes('Capa')));
  });
  await check('variante Pro Max e usado não comparados com 128 GB novo', async () => {
    assert.match(by('Pro Max').meta, /Sem anúncio equivalente/);
    assert.match(by('Vermelho').meta, /Sem anúncio equivalente/);
    assert.ok(by('Meia-noite').best, 'mais barato do grupo 128 GB novo');
  });
  await check('histórico real de preço → "Excelente oportunidade" (menor preço já visto)', async () => {
    assert.equal(by('Meia-noite').badge, 'Excelente oportunidade');
    assert.match(by('Meia-noite').why, /3 observações em 3 dia/);
  });
  await check('preço "de" nunca observado → "Desconto suspeito"', async () => {
    assert.equal(by('Azul').badge, 'Desconto suspeito');
    assert.match(by('Azul').why, /nunca foi observado/);
  });
  await check('sem histórico nunca é "Excelente"', async () => {
    for (const t of ['Estelar', 'Rosa', 'Verde']) assert.notEqual(by(t).badge, 'Excelente oportunidade');
  });
  await check('link de anúncio patrocinado sem ID: ★ desabilitado e sem histórico', async () => {
    assert.ok(by('Verde').starDisabled);
  });

  // Favoritos / acompanhamento
  await page.locator('.card', { hasText: 'Estelar' }).locator('.star').click();
  await page.waitForTimeout(200);
  await check('★ salva item acompanhado', async () => {
    const { watch } = await page.evaluate(() => chrome.storage.local.get('watch'));
    assert.ok(watch.MLB1000000003);
    assert.equal(watch.MLB1000000003.priceAtAdd, 3299);
  });
  await check('histórico de preços gravado (sem item de ID por título, sem link externo)', async () => {
    const { prices, searches } = await page.evaluate(() => chrome.storage.local.get(['prices', 'searches']));
    assert.ok(prices.MLB1000000003 && prices.MLB1000000004 && prices.MLB1000000007);
    assert.ok(!Object.keys(prices).some((k) => k.startsWith('T:')));
    assert.equal(prices.MLB1000000001.points.length, 4);
    assert.equal(searches[0].q, 'iphone 13');
  });
  await check('busca repetida na mesma hora não duplica ponto', async () => {
    await page.click('#searchBtn');
    await page.waitForTimeout(800);
    const { prices } = await page.evaluate(() => chrome.storage.local.get('prices'));
    assert.equal(prices.MLB1000000001.points.length, 4);
  });
  await check('persistência após recarregar + abas Histórico/Acompanhando', async () => {
    await page.reload();
    await page.click('[data-tab=historico]');
    await page.waitForSelector('#searchHistory li');
    assert.match(await page.$eval('#searchHistory', (e) => e.innerText), /iphone 13/);
    assert.match(await page.$eval('#priceHistory', (e) => e.innerText), /iPhone 13/);
    await page.click('[data-tab=acompanhando]');
    await page.waitForTimeout(200);
    assert.match(await page.$eval('#watchList', (e) => e.innerText), /Estelar[\s\S]*desde que marcou \(R\$ 3\.299,00\): 0\.0%/);
  });
  await check('variação do acompanhado reflete novo preço', async () => {
    await page.evaluate(() => chrome.storage.local.get('prices').then(({ prices }) => {
      prices.MLB1000000003.points.push({ t: Date.now() + 2 * 3600e3, price: 2999 });
      return chrome.storage.local.set({ prices });
    }));
    await page.click('[data-tab=historico]');
    await page.click('[data-tab=acompanhando]');
    await page.waitForTimeout(200);
    assert.match(await page.$eval('#watchList', (e) => e.innerText), /-9\.1%/);
  });
  await check('remover ★ na aba Acompanhando', async () => {
    await page.click('#watchList .star');
    await page.waitForTimeout(200);
    const { watch } = await page.evaluate(() => chrome.storage.local.get('watch'));
    assert.deepEqual(watch, {});
  });

  // Erros
  await page.click('[data-tab=buscar]');
  await page.fill('#q', 'iphone 13'); // o campo fica vazio após o reload
  mode = 'verify';
  await check('verificação anti-robô do ML → erro claro, sem resultados inventados', async () => {
    await page.click('#searchBtn');
    await page.waitForSelector('#status.error');
    const t = await page.$eval('#status', (e) => e.innerText);
    assert.match(t, /API: HTTP 403/);
    assert.match(t, /verificação de segurança/);
    assert.match(t, /Ir para a aba do ML/); // a aba fica aberta para o usuário concluir a verificação
    assert.equal(await page.$$eval('.card', (c) => c.length), 0);
  });
  mode = 'layout';
  await check('layout desconhecido → erro explicando, sem resultados inventados', async () => {
    await page.click('#searchBtn');
    await page.waitForFunction(() => /Copiar diagnóstico/.test(document.querySelector('#status').innerText), null, { timeout: 45000 });
    assert.match(await page.$eval('#status', (e) => e.innerText), /nenhum anúncio foi reconhecido/);
    assert.equal(await page.$$eval('.card', (c) => c.length), 0);
  });
  await check('apagar histórico', async () => {
    page.once('dialog', (d) => d.accept());
    await page.click('[data-tab=historico]');
    await page.click('#clearBtn');
    await page.waitForTimeout(300);
    const all = await page.evaluate(() => chrome.storage.local.get(null));
    assert.equal(Object.keys(all).length, 0);
  });
  await check('sem erros de JavaScript na página', async () => assert.deepEqual(errors, []));

  await ctx.close();
  for (const [s, n] of results) console.log(`${s.padEnd(6)} ${n}`);
  const failed = results.filter((r) => r[0] !== 'OK').length;
  console.log(`\n${results.length - failed}/${results.length} aprovados (REDE SIMULADA)`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
