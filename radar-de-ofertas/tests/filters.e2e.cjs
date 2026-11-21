// E2E v0.6.2: filtros "sinal de preço" na interface real da extensão.
// Dados SINTÉTICOS gravados no chrome.storage (sem rede). Valida a integração
// scoring.js → filters.js → panel.js, não a coleta no site real.

const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert/strict');
const EXT = path.resolve(__dirname, '..');
const DAY = 86400000;

(async () => {
  const ctx = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`], viewport: { width: 1280, height: 900 } });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(sw.url().replace('background.js', 'app.html'));
  const results = [];
  const check = async (name, fn) => { try { await fn(); results.push(['OK', name]); } catch (e) { results.push(['FALHOU', name + ' — ' + e.message.split('\n')[0]]); } };

  const seed = (profile) => p.evaluate(({ profile, DAY }) => {
    const now = Date.now(); const offers = {}; const prices = {}; let n = 1;
    const add = (title, price, extra = {}) => { const id = 'MLB' + (2000000000 + n++); offers[id] = { id, title, price, originalPrice: null, freeShipping: true, image: '', link: `https://produto.mercadolivre.com.br/MLB-${id.slice(3)}-x-_JM`, category: 'eletronicos', sources: ['ofertas'], firstSeen: now, lastSeen: now, ...extra }; return id; };
    if (profile === 'sintoma') {
      // perfil do sintoma relatado: produtos diferentes entre si, sem preço "de", sem histórico
      for (let i = 0; i < 40; i++) add(`Produto Distinto Modelo ZX-${100 + i}`, 50 + i * 7);
    } else {
      for (const pr of [399, 410, 389, 420, 405]) add('Air Fryer Mondial AF-30 4L', pr);
      add('Air Fryer Mondial AF-30 4L', 259); add('Air Fryer Mondial AF-30 4L', 360, { freeShipping: false }); add('Air Fryer Mondial AF-30 4L', 499); add('Air Fryer Mondial AF-30 4L', 120);
      const tv = add('Smart TV LG 55UR8750', 2399); prices[tv] = { points: [{ t: now - 5 * DAY, price: 2899 }, { t: now - 3 * DAY, price: 2950 }, { t: now - 2 * DAY, price: 2850 }] };
      add('Produto Raro XZ-9', 100, { originalPrice: 150 }); add('Perfume Raro X', 60, { originalPrice: 300 }); add('Ventilador Sem Par VX-1', 199);
    }
    return chrome.storage.local.set({ offers, prices });
  }, { profile, DAY });

  const options = () => p.$$eval('#oSignal option', (os) => os.map((o) => ({ v: o.value, t: o.textContent })));
  const count = () => p.$$eval('#offerList .offer', (l) => l.length);
  const shownCount = async () => Number((await p.$eval('#offerCount', (e) => e.innerText)).match(/: (\d+) oferta/)[1]);
  const go = async () => { await p.reload(); await p.waitForTimeout(500); await p.click('[data-tab=ofertas][data-group=""]'); await p.waitForTimeout(300); };

  await check('perfil do SINTOMA (sem preço "de", sem equivalentes, sem histórico): antes todos os filtros davam 0; agora "Sem referência" traz todas', async () => {
    await seed('sintoma'); await go();
    const total = await count();
    assert.equal(total, 40);
    await p.selectOption('#oSignal', 'sem-referencia'); await p.waitForTimeout(150);
    assert.equal(await count(), 40);
    const opts = await options();
    assert.match(opts.find((o) => o.v === 'sem-referencia').t, /\(40\)$/);
    assert.match(opts.find((o) => o.v === '').t, /\(40\)$/);
    await p.selectOption('#oSignal', '');
  });

  await check('cada opção: contagem exibida = cards mostrados = contagem do cabeçalho; nenhuma vazia neste conjunto', async () => {
    await seed('completo'); await go();
    const total = await count();
    assert.equal(total, 13);
    const covered = new Set();
    for (const { v, t } of await options()) {
      await p.selectOption('#oSignal', v); await p.waitForTimeout(150);
      const c = await count();
      assert.equal(Number(t.match(/\((\d+)\)$/)[1]), c, `opção ${v}: "${t}" vs ${c} cards`);
      assert.equal(await shownCount(), c);
      if (v) assert.ok(c > 0, `opção ${v} vazia`);
      if (!v) assert.equal(c, total, '"Qualquer" mostra todas');
      (await p.$$eval('#offerList .o-title', (a) => a.map((x) => x.href + x.textContent + x.closest('.offer').querySelector('.o-price').textContent))).forEach((k) => v && covered.add(k));
    }
    assert.equal(covered.size, total, 'a união das opções cobre todas as ofertas');
    await p.selectOption('#oSignal', '');
  });

  await check('filtros combinados: sinal + frete grátis + preço + classe', async () => {
    await p.selectOption('#oSignal', 'preco-competitivo'); await p.waitForTimeout(150);
    const comp = await count();
    await p.check('#oFree'); await p.waitForTimeout(150);
    assert.equal(await count(), comp - 1); // a de R$ 360 não tem frete grátis
    assert.match((await options()).find((o) => o.v === 'preco-competitivo').t, new RegExp(`\\(${comp - 1}\\)$`));
    await p.uncheck('#oFree');
    await p.selectOption('#oSignal', 'preco-excepcional'); await p.fill('#oMax', '1000'); await p.waitForTimeout(200);
    assert.equal(await count(), 1);
    await p.fill('#oMax', ''); await p.selectOption('#oLabel', 'suspeito'); await p.selectOption('#oSignal', ''); await p.waitForTimeout(200);
    assert.equal(await count(), 2);
    await p.selectOption('#oLabel', '');
  });

  await check('após uma nova varredura (novos dados no armazenamento) as contagens se atualizam sozinhas', async () => {
    await p.selectOption('#oSignal', 'desconto-comprovado'); await p.waitForTimeout(150);
    const before = await count();
    await p.evaluate((DAY) => chrome.storage.local.get(['offers', 'prices']).then(({ offers, prices }) => {
      const id = Object.keys(offers).find((k) => offers[k].price === 405);
      prices[id] = { points: [{ t: Date.now() - 4 * DAY, price: 520 }, { t: Date.now() - 2 * DAY, price: 515 }] };
      return chrome.storage.local.set({ prices });
    }), DAY);
    await p.waitForTimeout(800); // sem recarregar a página
    assert.equal(await count(), before + 1);
    assert.match((await options()).find((o) => o.v === 'desconto-comprovado').t, new RegExp(`\\(${before + 1}\\)$`));
  });

  await check('relatório mostra o diagnóstico dos filtros (sem sinal = 0, por sinal, preço "de")', async () => {
    await p.click('[data-tab=historico]');
    await p.click('#reportBtn'); await p.waitForTimeout(500);
    const t = await p.$eval('#reportOut', (e) => e.innerText);
    assert.match(t, /Sem sinal filtrável\s+0/);
    assert.match(t, /Filtro "sinal de preço"/);
    assert.match(t, /Sem preço "de"/);
  });

  await check('sem erros de JavaScript', async () => assert.deepEqual(errors, []));
  await ctx.close();
  for (const [s, n] of results) console.log(`${s.padEnd(6)} ${n}`);
  const failed = results.filter((r) => r[0] !== 'OK').length;
  console.log(`\n${results.length - failed}/${results.length} aprovados (DADOS SIMULADOS)`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
