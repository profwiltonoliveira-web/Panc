import { searchMercadoLivre, SearchError } from './lib/mercadolivre.js';
import { searchViaTab, readOpenTab, focusTab, TabReadError } from './lib/tab-reader.js';
import { analyze, fmt } from './lib/analyzer.js';
import * as store from './lib/storage.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
if (params.get('full')) document.body.classList.add('full');

let current = null; // { query, source, analysis }
let watch = {};
let controller = null;

// ---------- abas ----------
document.querySelectorAll('.tabs button').forEach((b) =>
  b.addEventListener('click', () => showTab(b.dataset.tab, b.dataset.group))
);
function showTab(name, group) {
  document.querySelectorAll('.tabs button').forEach((b) =>
    b.classList.toggle('active', b.dataset.tab === name && (name !== 'ofertas' || (b.dataset.group || '') === (group || ''))));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
  if (name === 'historico') renderHistory();
  if (name === 'acompanhando') renderWatch();
  // painel do radar (panel.js) reage à troca de aba
  document.dispatchEvent(new CustomEvent('radar:tab', { detail: { name, group: group || '' } }));
}

// ---------- busca ----------
$('#searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  runSearch($('#q').value);
});
['#fFree', '#fNew', '#fEquiv', '#fLabel', '#fSort'].forEach((s) => $(s).addEventListener('change', renderResults));

async function runSearch(query) {
  query = query.trim();
  if (!query) return;
  controller?.abort();
  controller = new AbortController();
  setBusy(true);
  setStatus(`Buscando "${query}" no Mercado Livre…`);
  $('#results').replaceChildren();
  $('#summary').hidden = true;

  const signal = controller.signal;
  const diagnostics = [];
  try {
    let found;
    try {
      found = await searchMercadoLivre(query, { signal });
    } catch (e) {
      if (e.diagnostic) diagnostics.push(e.diagnostic);
      if (e.name === 'AbortError' || !(e instanceof SearchError) || !e.blocked) throw e;
      // Leitura direta bloqueada ou sem anúncios reconhecidos → página aberta numa aba do navegador.
      setStatus('A leitura direta não trouxe anúncios. Abrindo a página de resultados do Mercado Livre numa aba em segundo plano…', e.details);
      try {
        const r = await searchViaTab(query);
        if (signal.aborted) return;
        diagnostics.push(r.diagnostic);
        found = { source: `Aba do Mercado Livre aberta no navegador (estratégia ${r.diagnostic.estrategia})`, items: r.items };
      } catch (te) {
        if (te.diagnostic) diagnostics.push(te.diagnostic);
        te.directDetails = e.details;
        throw te;
      }
    }
    if (signal.aborted) return;
    await showResults(query, found.source, found.items);
  } catch (e) {
    if (e.name === 'AbortError') return;
    showSearchError(e, diagnostics);
  } finally {
    setBusy(false);
  }
}

async function showResults(query, source, items) {
  const history = await store.getPriceHistory();
  const analysis = analyze(items, history, Date.now(), query);
  current = { query, source, analysis };
  setStatus(null);
  try {
    await store.recordSearch(query, source, analysis);
  } catch (err) {
    // Falha ao salvar não pode esconder resultados já obtidos.
    setStatus('Resultados exibidos, mas o histórico não pôde ser salvo: ' + (err.message || err), [], true);
  }
  renderSummary();
  renderResults();
}

function showSearchError(e, diagnostics) {
  current = null;
  const details = [];
  if (e.directDetails) details.push(...e.directDetails.map((d) => 'Leitura direta — ' + d));
  if (e instanceof SearchError) details.push(...e.details);
  else if (e instanceof TabReadError) details.push('Aba do navegador — ' + e.message);
  const msg = e instanceof TabReadError
    ? (e.needsUser ? 'Ação necessária na aba do Mercado Livre.' : 'Não foi possível obter anúncios reais.')
    : (e.message || 'Erro na busca.');
  setStatus(msg, details.length ? details : [String(e.message || e)], true);
  const actions = document.createElement('div');
  actions.className = 'status-actions';
  if (e instanceof TabReadError && e.tabId != null) {
    actions.append(button('Ir para a aba do ML', () => focusTab(e.tabId).catch(() => {})));
  }
  actions.append(button('Ler aba do ML', readTabNow));
  if (diagnostics.length) actions.append(button('Copiar diagnóstico', (ev) => copyDiagnostic(diagnostics, ev.target)));
  $('#status').append(actions);
}


function button(text, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ghost';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

async function copyDiagnostic(diags, btn) {
  const text = JSON.stringify({ radarDeOfertas: chrome.runtime.getManifest().version, quando: new Date().toISOString(), diagnosticos: diags }, null, 2);
  return copyText(text, btn, 'Diagnóstico copiado ✓');
}

function searchDataJson() {
  const a = current.analysis;
  return JSON.stringify({
    radarDeOfertas: chrome.runtime.getManifest().version,
    quando: new Date().toISOString(),
    busca: current.query,
    fonte: current.source,
    grupoPrincipal: a.stats.mainGroup,
    grupos: a.groups,
    anuncios: a.items.map((i) => ({
      titulo: i.title, preco: i.price, precoDe: i.originalPrice, frete: i.shipping, total: i.total,
      equivalente: i.equivalent, grupo: i.group, motivo: i.matchWhy, classificacao: i.label, link: i.link
    }))
  }, null, 2);
}

async function copyText(text, btn, okText) {
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = okText;
  } catch {
    // Sem permissão de área de transferência: mostra o texto para copiar manualmente.
    const ta = document.createElement('textarea');
    ta.className = 'diag'; ta.readOnly = true; ta.value = text;
    btn.parentElement.append(ta);
    ta.select();
  }
}

// Lê os anúncios da página de resultados do ML aberta pelo usuário.
async function readTabNow() {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  setBusy(true);
  setStatus('Lendo anúncios da aba do Mercado Livre…');
  $('#results').replaceChildren();
  $('#summary').hidden = true;
  try {
    const r = await readOpenTab();
    if (signal.aborted) return;
    const query = r.query || $('#q').value.trim() || 'mercado livre';
    $('#q').value = query;
    await showResults(query, `Aba do Mercado Livre aberta no navegador (estratégia ${r.diagnostic.estrategia})`, r.items);
  } catch (e) {
    if (signal.aborted) return;
    showSearchError(e, e.diagnostic ? [e.diagnostic] : []);
  } finally {
    setBusy(false);
  }
}
$('#readTab').addEventListener('click', readTabNow);

function setBusy(b) {
  $('#searchBtn').disabled = b;
  $('#readTab').disabled = b;
  $('#searchBtn').textContent = b ? 'Buscando…' : 'Buscar';
}

function setStatus(msg, details = [], isError = false) {
  const el = $('#status');
  if (!msg) { el.hidden = true; return; }
  el.hidden = false;
  el.className = 'status' + (isError ? ' error' : '');
  el.replaceChildren(document.createTextNode(msg));
  if (details.length) {
    const ul = document.createElement('ul');
    details.forEach((d) => { const li = document.createElement('li'); li.textContent = d; ul.append(li); });
    el.append(ul);
  }
}

function renderSummary() {
  const { stats } = current.analysis;
  const box = $('#summary');
  const cell = (val, label) => {
    const d = document.createElement('div');
    const b = document.createElement('b'); b.textContent = val;
    const s = document.createElement('span'); s.textContent = label;
    d.append(b, s);
    return d;
  };
  const src = document.createElement('div');
  src.className = 'src';
  const money = (n) => (n == null ? '—' : 'R$ ' + fmt(n));
  const exact = stats.mainGroup === 'padrão';
  const groupTxt = exact ? 'grupo que corresponde exatamente à busca' : `maior grupo de equivalentes (variante: ${stats.mainGroup}) — nenhum anúncio corresponde exatamente à busca`;
  const others = current.analysis.groups.filter((g) => g.group !== stats.mainGroup)
    .map((g) => `${g.group === 'padrão' ? 'sem variante' : g.group} ${g.count} (a partir de ${money(g.refMin)})`);
  src.textContent = `Fonte: ${current.source} · ${stats.count} anúncios, ${stats.equivalentCount} equivalentes à busca · valores acima: ${groupTxt}, ${stats.mainGroupCount} anúncios` +
    (stats.spreadPct != null ? ` · diferença mais barato → mais caro: ${stats.spreadPct.toFixed(0)}%` : '') +
    (others.length ? ` · outros grupos (não misturados): ${others.join('; ')}` : '') +
    ` · frete conhecido em ${stats.shippingKnownCount}. `;
  // Exporta os anúncios lidos (dados públicos dos anúncios) para conferência com a página do ML.
  src.append(button('Copiar dados da busca', (ev) => copyText(searchDataJson(), ev.target, 'Dados copiados ✓')));
  box.replaceChildren(
    cell(money(stats.refMin), 'Menor total'),
    cell(money(stats.median), 'Mediana'),
    cell(money(stats.max), 'Maior total'),
    cell(String(current.analysis.items.filter((i) => i.label === 'excelente' || i.label === 'boa').length), 'Oportunidades'),
    src
  );
  box.hidden = false;
}

function filteredItems() {
  let list = current.analysis.items.slice();
  if ($('#fEquiv').checked) list = list.filter((i) => i.equivalent);
  if ($('#fFree').checked) list = list.filter((i) => i.freeShipping);
  if ($('#fNew').checked) list = list.filter((i) => i.condition !== 'usado' && i.condition !== 'recondicionado');
  const lbl = $('#fLabel').value;
  if (lbl) list = list.filter((i) => i.label === lbl);
  const sort = $('#fSort').value;
  const eqFirst = (a, b) => b.equivalent - a.equivalent; // não equivalentes sempre no fim
  if (sort === '-total') list.sort((a, b) => eqFirst(a, b) || b.total - a.total);
  else if (sort === 'discount') list.sort((a, b) => eqFirst(a, b) || (b.claimedDiscount || 0) - (a.claimedDiscount || 0));
  else list.sort((a, b) => eqFirst(a, b) || a.total - b.total);
  return list;
}

async function renderResults() {
  if (!current) return;
  ({ watch } = await store.getAll());
  const ul = $('#results');
  const list = filteredItems();
  if (!list.length) {
    const p = document.createElement('li');
    p.className = 'empty';
    p.textContent = 'Nenhum resultado com os filtros atuais.';
    ul.replaceChildren(p);
    return;
  }
  ul.replaceChildren(...list.map((it) => renderCard(it, it.isCheapest)));
}

function renderCard(it, isCheapest) {
  const node = $('#resultTpl').content.firstElementChild.cloneNode(true);
  if (isCheapest) node.classList.add('best');
  if (!it.equivalent) node.classList.add('other');
  node.querySelector('.thumb').href = it.link;
  const img = node.querySelector('img');
  if (it.image) { img.addEventListener('error', () => { img.style.visibility = 'hidden'; }); img.src = it.image; } else img.remove();
  const title = node.querySelector('.title');
  title.href = it.link;
  title.textContent = it.title;
  title.title = it.title;
  node.querySelector('.price').textContent = 'R$ ' + fmt(it.price);
  if (it.originalPrice) {
    node.querySelector('.orig').textContent = 'R$ ' + fmt(it.originalPrice);
    node.querySelector('.off').textContent = `${it.claimedDiscount.toFixed(0)}% OFF anunciado`;
  }

  const meta = [];
  if (it.freeShipping) meta.push('Frete grátis');
  else if (it.shipping != null) meta.push('Frete R$ ' + fmt(it.shipping));
  else meta.push('Frete não informado');
  meta.push('Total R$ ' + fmt(it.total) + (it.shippingKnown ? '' : '*'));
  if (!it.equivalent) meta.push('Produto diferente da busca?');
  else if (it.groupSize < 2) meta.push('Sem anúncio equivalente para comparar');
  else {
    meta.push(isCheapest ? 'Mais barato do grupo' : `${it.diffVsCheapest >= 0 ? '+' : ''}${it.diffVsCheapest.toFixed(1)}% vs mais barato equivalente`);
    if (it.diffVsMedian != null) meta.push(`${it.diffVsMedian >= 0 ? '+' : ''}${it.diffVsMedian.toFixed(1)}% vs mediana`);
    if (it.group !== 'padrão') meta.push('grupo: ' + it.group);
  }
  if (it.condition) meta.push(it.condition);
  if (it.seller) meta.push(it.seller);
  node.querySelector('.meta').textContent = meta.join(' · ');

  const badge = node.querySelector('.badge');
  badge.textContent = it.labelText;
  badge.classList.add(it.label);
  node.querySelector('.conf').textContent = 'confiança ' + it.confidence;
  const why = node.querySelector('.why ul');
  it.reasons.forEach((r) => { const li = document.createElement('li'); li.textContent = r; why.append(li); });

  const star = node.querySelector('.star');
  const setStar = (on) => { star.textContent = on ? '★' : '☆'; star.classList.toggle('on', on); };
  if (String(it.id).startsWith('T:')) {
    star.disabled = true;
    star.title = 'Link sem identificador de anúncio: não é possível acompanhar o preço.';
  } else {
    setStar(!!watch[it.id]);
    star.addEventListener('click', async () => {
      star.disabled = true;
      try { setStar(await store.toggleWatch(it)); } finally { star.disabled = false; }
    });
  }
  return node;
}

// ---------- histórico ----------
async function renderHistory() {
  const { searches, prices } = await store.getAll();
  const sh = $('#searchHistory');
  if (!searches.length) sh.replaceChildren(empty('Nenhuma pesquisa ainda.'));
  else sh.replaceChildren(...searches.slice(0, 50).map((s) => {
    const li = document.createElement('li');
    const g = document.createElement('div'); g.className = 'grow';
    const b = document.createElement('button'); b.className = 'link'; b.textContent = s.q;
    b.addEventListener('click', () => { $('#q').value = s.q; showTab('buscar'); runSearch(s.q); });
    const sub = document.createElement('div'); sub.className = 'sub';
    sub.textContent = `${new Date(s.t).toLocaleString('pt-BR')} · ${s.count} anúncios` + (s.min != null ? ` · menor R$ ${fmt(s.min)} · mediana R$ ${fmt(s.median)}` : '');
    g.append(b, sub);
    li.append(g);
    return li;
  }));
  renderPriceList(prices);
}

$('#histFilter').addEventListener('input', async () => renderPriceList(await store.getPriceHistory()));

function renderPriceList(prices) {
  const f = $('#histFilter').value.trim().toLowerCase();
  const entries = Object.entries(prices)
    .filter(([, e]) => !f || e.title.toLowerCase().includes(f))
    .sort((a, b) => b[1].points.length - a[1].points.length || lastT(b[1]) - lastT(a[1]))
    .slice(0, 100);
  const ul = $('#priceHistory');
  if (!entries.length) { ul.replaceChildren(empty('Nenhum preço registrado.')); return; }
  ul.replaceChildren(...entries.map(([, e]) => priceRow(e)));
}

function priceRow(e, extra) {
  const li = document.createElement('li');
  const g = document.createElement('div'); g.className = 'grow';
  const a = document.createElement('a'); a.className = 'name'; a.href = e.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
  a.textContent = e.title; a.title = e.title;
  const pts = e.points || [];
  const sub = document.createElement('div'); sub.className = 'sub';
  if (pts.length) {
    const ps = pts.map((p) => p.price);
    const last = ps[ps.length - 1];
    sub.textContent = `Atual R$ ${fmt(last)} · mín R$ ${fmt(Math.min(...ps))} · máx R$ ${fmt(Math.max(...ps))} · ${pts.length} obs. · última ${new Date(pts[pts.length - 1].t).toLocaleDateString('pt-BR')}`;
  } else sub.textContent = 'Sem observações.';
  if (extra) sub.append(extra);
  g.append(a, sub);
  li.append(g, sparkline(pts));
  return li;
}

function sparkline(points, w = 110, h = 32) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', w); svg.setAttribute('height', h); svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  if (points.length < 2) return svg;
  const ps = points.map((p) => p.price);
  const min = Math.min(...ps), max = Math.max(...ps), span = max - min || 1;
  const t0 = points[0].t, tspan = points[points.length - 1].t - t0 || 1;
  const xy = points.map((p) => [2 + ((p.t - t0) / tspan) * (w - 4), h - 3 - ((p.price - min) / span) * (h - 6)]);
  const path = document.createElementNS(ns, 'polyline');
  path.setAttribute('points', xy.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' '));
  path.setAttribute('class', 'spark-line');
  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('cx', xy[xy.length - 1][0]); dot.setAttribute('cy', xy[xy.length - 1][1]); dot.setAttribute('r', 2.5);
  dot.setAttribute('class', 'spark-dot');
  svg.append(path, dot);
  return svg;
}

const lastT = (e) => (e.points.length ? e.points[e.points.length - 1].t : 0);
function empty(t) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = t; return li; }

$('#clearBtn').addEventListener('click', async () => {
  if (!confirm('Apagar todo o histórico de pesquisas, preços e itens acompanhados?')) return;
  await store.clearAll();
  renderHistory();
});

$('#exportBtn').addEventListener('click', async () => {
  const blob = new Blob([await store.exportJson()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `radar-de-ofertas-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------- acompanhando ----------
async function renderWatch() {
  const all = await store.getAll();
  const ids = Object.keys(all.watch);
  const ul = $('#watchList');
  if (!ids.length) { ul.replaceChildren(empty('Nenhum item acompanhado.')); return; }
  ul.replaceChildren(...ids.map((id) => {
    const w = all.watch[id];
    const e = all.prices[id] || { title: w.title, link: w.link, points: [] };
    const pts = e.points;
    const extra = document.createElement('span');
    if (pts.length) {
      const now = pts[pts.length - 1].price;
      const d = ((now - w.priceAtAdd) / w.priceAtAdd) * 100;
      extra.textContent = ` · desde que marcou (R$ ${fmt(w.priceAtAdd)}): ${d > 0 ? '+' : ''}${d.toFixed(1)}%`;
      extra.className = d > 0.5 ? 'up' : d < -0.5 ? 'down' : '';
    }
    const li = priceRow(e, extra);
    const rm = document.createElement('button');
    rm.className = 'star on'; rm.textContent = '★'; rm.title = 'Parar de acompanhar';
    rm.addEventListener('click', async () => { await store.toggleWatch({ id, ...w }); renderWatch(); });
    li.append(rm);
    return li;
  }));
}

// ---------- início ----------
const initial = params.get('q');
if (initial) { showTab('buscar'); $('#q').value = initial; runSearch(initial); }
else if (params.get('tab')) showTab(params.get('tab'), params.get('group'));
