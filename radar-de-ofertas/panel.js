// Painel de oportunidades: controle do radar, listas por categoria, filtros, cópia de ofertas.
// A varredura roda no service worker (background.js / lib/discovery.js); este painel só
// envia comandos e acompanha o progresso pelo chrome.storage.

import { CATEGORIES, CATEGORY_BY_ID, GROUPS } from './lib/categories.js';
import { SUGGESTIONS, resolveBrand, normalizeBrand, slug as brandSlug } from './lib/brands.js';
import { classificationReport } from './lib/report.js';
import { scoreAll, shareText, LABEL_RANK, cleanLink, fmt, DEFAULT_WEIGHTS, WEIGHT_LABELS, normalizeWeights } from './lib/scoring.js';
import * as store from './lib/storage.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

let view = { name: 'radar', group: '' };
let scored = [];
let watch = {};
let weights = { ...DEFAULT_WEIGHTS };

// ---------- comandos ----------
$('#radarStart').addEventListener('click', async () => {
  $('#radarStart').disabled = true;
  try {
    await chrome.runtime.sendMessage({ type: 'radar:start' });
  } catch (e) {
    showStatus('Não foi possível iniciar o radar: ' + (e.message || e), true);
    $('#radarStart').disabled = false;
  }
});
$('#radarStop').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'radar:stop' }));

// ---------- configurações ----------
async function loadSettings() {
  const s = await store.getSettings();
  $('#setInterval').value = String(s.interval);
  $('#setPages').value = String(s.pages);
  $('#setTabManual').checked = !!s.allowTabManual;
  $('#setTabAuto').checked = !!s.allowTabAuto;
  $('#setNotify').checked = !!s.notify;
  weights = normalizeWeights(s.weights || DEFAULT_WEIGHTS);
  renderWeights();
}

// Pesos configuráveis da pontuação (0–100 cada; a nota é a média ponderada das subnotas).
function renderWeights() {
  const box = $('#weightsBox');
  box.replaceChildren(...Object.keys(DEFAULT_WEIGHTS).map((k) => {
    const row = el('label', 'w-row');
    const inp = el('input');
    inp.type = 'number'; inp.min = '0'; inp.max = '100'; inp.step = '1'; inp.value = String(weights[k]); inp.id = 'w-' + k;
    inp.addEventListener('change', async () => {
      weights = normalizeWeights({ ...weights, [k]: Number(inp.value) });
      inp.value = String(weights[k]);
      await store.saveSettings({ weights });
      refresh();
    });
    row.append(el('span', '', WEIGHT_LABELS[k]), inp);
    return row;
  }));
}
$('#weightsReset').addEventListener('click', async () => {
  weights = { ...DEFAULT_WEIGHTS };
  await store.saveSettings({ weights: null });
  renderWeights();
  refresh();
});
$('#setInterval').addEventListener('change', (e) => store.saveSettings({ interval: Number(e.target.value) }));
$('#setPages').addEventListener('change', (e) => store.saveSettings({ pages: Number(e.target.value) }));
$('#setTabManual').addEventListener('change', (e) => store.saveSettings({ allowTabManual: e.target.checked }));
$('#setTabAuto').addEventListener('change', (e) => store.saveSettings({ allowTabAuto: e.target.checked }));
$('#setNotify').addEventListener('change', (e) => store.saveSettings({ notify: e.target.checked }));

// ---------- estado da varredura ----------
function showStatus(msg, isError = false, actions = []) {
  const box = $('#radarStatus');
  if (!msg) { box.hidden = true; return; }
  box.hidden = false;
  box.className = 'status' + (isError ? ' error' : '');
  box.replaceChildren(document.createTextNode(msg));
  if (actions.length) { const a = el('div', 'status-actions'); a.append(...actions); box.append(a); }
}

function renderState(st, scans) {
  const running = !!(st && st.running);
  $('#radarStart').disabled = running;
  $('#radarStart').textContent = running ? 'Radar em andamento…' : (scans.length ? 'Atualizar' : 'Iniciar Radar');
  $('#radarStop').hidden = !running;
  const last = scans.find((s) => s.finished);
  $('#lastRun').textContent = last ? 'Última varredura: ' + new Date(last.finished).toLocaleString('pt-BR') : 'Nenhuma varredura ainda';
  if (!st) { showStatus(scans.length ? null : 'Clique em "Iniciar Radar" para descobrir ofertas no Mercado Livre. A varredura lê as páginas públicas de ofertas por categoria (cerca de 1 minuto).'); return; }
  if (running) {
    showStatus(`${st.message || 'Varrendo…'} (${st.done}/${st.total} fontes · ${st.found || 0} anúncios lidos)`);
    return;
  }
  const actions = [];
  if (st.needsUser && st.needsUser.tabId != null) {
    actions.push(button('Ir para a janela do Mercado Livre', () => chrome.tabs.update(st.needsUser.tabId, { active: true }).then((t) => chrome.windows.update(t.windowId, { focused: true, state: 'normal' })).catch(() => {})));
  }
  const failed = !st.found;
  if (scans[0]) actions.push(button('Copiar diagnóstico', (ev) => copy(JSON.stringify({ radarDeOfertas: chrome.runtime.getManifest().version, varredura: scans[0] }, null, 2), ev.target, 'Diagnóstico copiado ✓')));
  showStatus((failed ? 'Nenhum anúncio real foi obtido. ' : 'Varredura concluída: ') + (st.message || ''), failed || !!st.needsUser, actions);
}

function renderSources(scans) {
  const ul = $('#radarSources');
  const s = scans[0];
  if (!s) { ul.replaceChildren(el('li', 'muted', 'Nenhuma varredura ainda.')); return; }
  const icon = { ok: '✅', vazio: '⚪', bloqueado: '⛔', erro: '⚠️', pulada: '⏭️' };
  ul.replaceChildren(...s.sources.map((x) => {
    const li = el('li');
    li.append(el('span', '', `${icon[x.status] || '•'} ${x.name}`));
    li.append(el('span', 'muted', x.status === 'ok' ? ` ${x.count} anúncios, ${x.unique} únicos, ${x.added} novos (${x.method === 'aba' ? 'aba' : 'leitura direta'})` : ` ${x.error || x.status}`));
    return li;
  }));
}

// ---------- ofertas ----------
function fillCategorySelect() {
  const sel = $('#oCat');
  const cats = CATEGORIES.filter((c) => !view.group || c.group === view.group);
  sel.replaceChildren(el('option', '', 'Todas as categorias'), ...cats.map((c) => { const o = el('option', '', c.name); o.value = c.id; return o; }));
  sel.firstChild.value = '';
}

function applyFilters(list) {
  const text = $('#oText').value.trim().toLowerCase();
  const cat = $('#oCat').value;
  const min = Number($('#oMin').value) || 0;
  const max = Number($('#oMax').value) || Infinity;
  const disc = Number($('#oDisc').value) || 0;
  const proven = $('#oProven').checked;
  const free = $('#oFree').checked;
  const cond = $('#oCond').value;
  const lbl = $('#oLabel').value;
  const noAcc = $('#oAcc').checked;
  const signal = $('#oSignal').value;
  let out = list.filter((o) => {
    if (view.group && (CATEGORY_BY_ID[o.category] || CATEGORY_BY_ID.outros).group !== view.group) return false;
    if (cat && o.category !== cat) return false;
    if (text && !o.title.toLowerCase().includes(text)) return false;
    if (o.price < min || o.price > max) return false;
    if (disc && !(o.discountPct >= disc)) return false;
    if (proven && o.discountKind !== 'comprovado') return false;
    if (free && !o.freeShipping) return false;
    if (cond === 'novo' && (o.condition === 'usado' || o.condition === 'recondicionado')) return false;
    if (cond === 'usado' && !(o.condition === 'usado' || o.condition === 'recondicionado')) return false;
    if (!labelOk(o, lbl)) return false;
    if (noAcc && o.accessory) return false;
    if (signal && !(o.priceInfo && o.priceInfo.signals.includes(signal))) return false;
    return true;
  });
  const sort = $('#oSort').value;
  if (sort === 'discount') out.sort((a, b) => (b.discountPct || 0) - (a.discountPct || 0));
  else if (sort === 'price') out.sort((a, b) => a.price - b.price);
  else if (sort === 'new') out.sort((a, b) => b.firstSeen - a.firstSeen);
  else out.sort((a, b) => b.score - a.score);
  return out;
}

// Classe: "suspeito"/"regular" = exatamente; demais = essa classe ou melhor.
function labelOk(o, lbl) {
  if (!lbl) return true;
  if (lbl === 'suspeito' || lbl === 'regular') return o.label === lbl;
  return o.label !== 'suspeito' && LABEL_RANK[o.label] >= LABEL_RANK[lbl];
}

function offerCard(o) {
  const node = $('#offerTpl').content.firstElementChild.cloneNode(true);
  node.classList.add('l-' + o.label);
  const link = cleanLink(o.link);
  node.querySelector('.o-thumb').href = link;
  const img = node.querySelector('img');
  if (o.image) { img.addEventListener('error', () => { img.style.visibility = 'hidden'; }); img.src = o.image; } else img.remove();
  const t = node.querySelector('.o-title');
  t.href = link; t.textContent = o.title; t.title = o.title;
  node.querySelector('.o-price').textContent = 'R$ ' + fmt(o.price);
  const prev = node.querySelector('.o-prev');
  const disc = node.querySelector('.o-disc');
  if (o.discountKind === 'comprovado') {
    prev.textContent = `média observada R$ ${fmt(o.previousPrice)}`;
    disc.textContent = `−${o.discountPct.toFixed(0)}% comprovado`;
    disc.classList.add('proven');
  } else if (o.discountKind === 'corroborado') {
    prev.textContent = `de R$ ${fmt(o.originalPrice)} · equivalentes R$ ${fmt(o.peerMedian)}`;
    disc.textContent = `−${o.discountPct.toFixed(0)}% confirmado por ${o.peers} equivalentes`;
    disc.classList.add('proven');
  } else if (o.discountKind === 'campanha' || o.discountKind === 'anunciado') {
    prev.textContent = `de R$ ${fmt(o.originalPrice)}`;
    prev.classList.add('strike');
    disc.textContent = `${o.discountPct.toFixed(0)}% OFF ${o.discountKind === 'campanha' ? 'em campanha do ML' : 'anunciado'}`;
  }
  const cat = CATEGORY_BY_ID[o.category] || CATEGORY_BY_ID.outros;
  const meta = [];
  meta.push(o.seller ? `${o.seller}${o.officialStore ? ' · loja oficial' : ''}` : (o.officialStore ? 'Loja oficial' : 'Loja não informada'));
  meta.push(o.freeShipping ? 'Frete grátis' : 'Frete não informado');
  if (o.condition) meta.push(o.condition);
  meta.push(cat.name);
  node.querySelector('.o-meta').textContent = meta.join(' · ');
  const badge = node.querySelector('.badge');
  badge.textContent = o.labelText;
  badge.classList.add(o.label);
  node.querySelector('.o-score').textContent = `Nota ${o.score}/100`;
  const sig = node.querySelector('.sig');
  sig.textContent = o.priceSignalText;
  sig.classList.add(o.priceSignal);
  const rd = o.realDiscount || { level: 'nenhum', text: 'Sem desconto', value: 0 };
  const da = el('span', 'disc-a ' + rd.level, rd.text);
  node.querySelector('.o-row').insertBefore(da, node.querySelector('.o-score'));
  node.querySelector('.o-sub').textContent = `Desconto real (A): ${rd.value}/100 · Atratividade do preço (B): ${o.attractiveness == null ? 'sem referência' : o.attractiveness + '/100'}` +
    ` (${o.peers} equivalente${o.peers === 1 ? '' : 's'})`;
  const tags = [];
  if (o.accessory) tags.push('acessório');
  for (const [b, m] of Object.entries(o.brands || {})) tags.push(`${brandName(b)}${m === 'compativel' ? ' (compatível, terceiros)' : m === 'oficial' ? ' (loja oficial)' : ''}`);
  for (const b of o.badges || []) tags.push(b.toLowerCase());
  node.querySelector('.o-tags').textContent = tags.join(' · ');
  const why = node.querySelector('.why ul');
  for (const r of o.reasons) why.append(el('li', '', r));

  node.querySelector('.o-copy').addEventListener('click', (ev) => copy(shareText(o), ev.target, 'Copiado ✓'));
  const star = node.querySelector('.star');
  const setStar = (on) => { star.textContent = on ? '★' : '☆'; star.classList.toggle('on', on); };
  if (String(o.id).startsWith('T:')) { star.disabled = true; star.title = 'Sem identificador de anúncio: não dá para favoritar.'; }
  else {
    setStar(!!watch[o.id]);
    star.addEventListener('click', async () => {
      star.disabled = true;
      try { setStar(await store.toggleWatch(o)); } finally { star.disabled = false; }
    });
  }
  return node;
}

function renderOffers() {
  if (view.name === 'radar') {
    renderHighlights();
    const top = scored.filter((o) => o.label !== 'suspeito').sort((a, b) => b.score - a.score).slice(0, 60);
    $('#topOffers').replaceChildren(...(top.length ? top.map(offerCard) : [el('li', 'empty', 'Nenhuma oferta ainda. Clique em "Iniciar Radar".')]));
  } else if (view.name === 'ofertas') {
    const list = applyFilters(scored);
    const shown = list.slice(0, 300);
    const groupName = view.group ? (GROUPS.find((g) => g.id === view.group) || {}).name : 'Todas as ofertas';
    $('#offerCount').textContent = `${groupName}: ${list.length} oferta(s)` + (list.length > shown.length ? ` (mostrando ${shown.length})` : '') + ` de ${scored.length} encontradas pelo radar.`;
    $('#offerList').replaceChildren(...(shown.length ? shown.map(offerCard) : [el('li', 'empty', scored.length ? 'Nenhuma oferta com os filtros atuais.' : 'Nenhuma oferta ainda. Clique em "Iniciar Radar".')]));
  }
}

// Destaques do painel: descontos comprovados, preços excepcionais, boas oportunidades, marcas monitoradas.
function renderHighlights() {
  const byScore = (a, b) => b.score - a.score;
  const monitored = new Set(settingsCache.monitorBrands || []);
  const sections = [
    ['Descontos comprovados', 'preço abaixo da média que o Radar já observou neste anúncio', scored.filter((o) => o.discountKind === 'comprovado')],
    ['Preços excepcionais', '≥ 25% abaixo de anúncios equivalentes', scored.filter((o) => o.label !== 'suspeito' && o.priceInfo && o.priceInfo.signals.includes('preco-excepcional'))],
    ['Boas oportunidades', 'classe boa ou excelente', scored.filter((o) => o.label === 'boa' || o.label === 'excelente')],
    ['Achados de marcas monitoradas', monitored.size ? [...monitored].map(brandName).join(', ') : 'nenhuma marca monitorada — ative em Busca manual → Marca', scored.filter((o) => o.label !== 'suspeito' && Object.keys(o.brands || {}).some((b) => monitored.has(b) && o.brands[b] !== 'compativel'))]
  ];
  $('#highlights').replaceChildren(...sections.map(([title, hint, list]) => {
    const sec = el('section', 'hl-section');
    const h = el('h3', '', title + ' ');
    h.append(el('span', 'muted', `${list.length} · ${hint}`));
    const ul = el('ul', 'offers');
    const top = list.sort(byScore).slice(0, 6);
    ul.replaceChildren(...(top.length ? top.map(offerCard) : [el('li', 'empty', 'Nada por enquanto.')]));
    sec.append(h, ul);
    return sec;
  }));
}

['#oText', '#oCat', '#oMin', '#oMax', '#oDisc', '#oProven', '#oSignal', '#oFree', '#oCond', '#oLabel', '#oAcc', '#oSort'].forEach((s) =>
  $(s).addEventListener(s === '#oText' || s === '#oMin' || s === '#oMax' ? 'input' : 'change', renderOffers));

// ---------- histórico de varreduras ----------
function renderScans(scans) {
  const ul = $('#scanHistory');
  if (!ul) return;
  if (!scans.length) { ul.replaceChildren(el('li', 'empty', 'Nenhuma varredura ainda.')); return; }
  ul.replaceChildren(...scans.slice(0, 20).map((s) => {
    const li = el('li');
    const g = el('div', 'grow');
    const ok = s.sources.filter((x) => x.status === 'ok').length;
    g.append(el('div', 'name', `${new Date(s.t).toLocaleString('pt-BR')} · ${s.mode === 'auto' ? 'automática' : 'manual'}`));
    g.append(el('div', 'sub', `${s.found} anúncios lidos · ${s.newOffers} novos · ${ok}/${s.sources.length} fontes OK` + (s.stoppedReason ? ` · interrompida: ${s.stoppedReason}` : '')));
    li.append(g, button('Copiar diagnóstico', (ev) => copy(JSON.stringify({ radarDeOfertas: chrome.runtime.getManifest().version, varredura: s }, null, 2), ev.target, 'Copiado ✓')));
    return li;
  }));
}

// ---------- utilidades ----------
function button(text, onClick) {
  const b = el('button', 'ghost', text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

async function copy(text, btn, ok) {
  try {
    await navigator.clipboard.writeText(text);
    const old = btn.textContent;
    btn.textContent = ok;
    setTimeout(() => { btn.textContent = old; }, 1500);
  } catch {
    const ta = el('textarea', 'diag');
    ta.readOnly = true; ta.value = text;
    btn.parentElement.append(ta);
    ta.select();
  }
}

// ---------- ciclo ----------
async function refresh() {
  const r = await store.getRadar();
  watch = r.watch;
  settingsCache = await store.getSettings();
  userBrands = (await store.getBrandData()).brands;
  scored = scoreAll(Object.values(r.offers), r.prices, Date.now(), weights);
  renderState(r.radarState, r.scans);
  renderJobStatus(r.radarState);
  if (view.name === 'buscar') { renderBrandMode(); renderCategoryMode(); }
  renderSources(r.scans);
  renderScans(r.scans);
  renderOffers();
  if (view.name === 'historico') renderAudit();
}

// ---------- auditoria de fontes e armazenamento ----------
async function renderAudit() {
  const stats = await store.getSourceStats();
  const t = $('#sourceAudit');
  const rows = Object.entries(stats).sort((a, b) => (b[1].unique / (b[1].runs || 1)) - (a[1].unique / (a[1].runs || 1)));
  const head = el('tr');
  for (const h of ['Fonte', 'Consultas', 'Com anúncios', 'Anúncios/consulta', 'Únicos/consulta', '% únicos', 'Novos (total)', '% acessórios', 'Última']) head.append(el('th', '', h));
  t.replaceChildren(head, ...(rows.length ? rows.map(([, s]) => {
    const tr = el('tr');
    const per = (x) => (s.runs ? (x / s.runs).toFixed(1) : '—');
    const pc = (x, d) => (d ? ((x / d) * 100).toFixed(0) + '%' : '—');
    for (const v of [s.name, s.runs, s.okRuns, per(s.items), per(s.unique), pc(s.unique, s.items), s.added, pc(s.accessories, s.items), s.lastStatus || '—']) tr.append(el('td', '', String(v)));
    return tr;
  }) : [(() => { const tr = el('tr'); const td = el('td', 'muted', 'Nenhuma varredura ainda.'); td.colSpan = 9; tr.append(td); return tr; })()]));
  const r = await store.storageReport();
  const mb = (b) => (b / 1048576).toFixed(2) + ' MB';
  const big = Object.entries(r.perKey).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${mb(v)}`).join(', ');
  $('#storageInfo').textContent = `Em uso: ${mb(r.used)} de ${mb(r.quota)} (${((r.used / r.quota) * 100).toFixed(1)}%) · ${r.counts.ofertas} ofertas, ${r.counts.historicos} históricos de preço, ${r.counts.favoritos} favoritos, ${r.counts.varreduras} varreduras · maiores: ${big || '—'}.` +
    ' A poda automática começa em 70% e reduz até 55%, sem apagar favoritos.' +
    (r.lastPrune ? ` Última poda: ${new Date(r.lastPrune.t).toLocaleString('pt-BR')} (${mb(r.lastPrune.before)} → ${mb(r.lastPrune.after)}).` : '');
}

let pending = null;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (!['offers', 'radarState', 'scans', 'watch', 'prices', 'sourceStats', 'brandFavs', 'brands', 'brandSearches', 'settings'].some((k) => k in changes)) return;
  clearTimeout(pending);
  pending = setTimeout(refresh, 250); // agrupa várias gravações seguidas
});

document.addEventListener('radar:tab', (e) => {
  view = e.detail;
  if (view.name === 'ofertas') fillCategorySelect();
  renderOffers();
  if (view.name === 'historico') { store.getRadar().then((r) => renderScans(r.scans)); renderAudit(); }
  if (view.name === 'buscar') { renderBrandMode(); renderCategoryMode(); }
});

// =================== v0.6: modalidades de busca (Produto / Marca / Categoria) ===================
let settingsCache = {};
let userBrands = {}; // cadastro do usuário (chrome.storage "brands")
const brandName = (id) => (userBrands[id] || SUGGESTIONS[id] || { name: id }).name;
let currentBrand = null;   // id da marca exibida
let currentCategory = null;

document.querySelectorAll('.modes .mode').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
function setMode(m) {
  document.querySelectorAll('.modes .mode').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
  document.querySelectorAll('.mode-pane').forEach((p) => { p.hidden = p.id !== 'mode-' + m; });
  if (m === 'marca') renderBrandMode();
  if (m === 'categoria') renderCategoryMode();
}

function chip(text, on, onClick, title) {
  const c = el('button', 'chip' + (on ? ' on' : ''), text);
  c.type = 'button';
  if (title) c.title = title;
  c.addEventListener('click', onClick);
  return c;
}

async function brandInputSpec() {
  const v = $('#brandInput').value.trim();
  if (!v) return null;
  const { brands } = await store.getBrandData();
  return resolveBrand(v, brands); // qualquer nome: cadastro, sugestão ou marca livre
}

/** Garante a marca no cadastro (ao favoritar/monitorar uma marca digitada ou sugerida). */
async function ensureRegistered(b) {
  if (b.registered) return b.id;
  const n = normalizeBrand({ name: b.name, aliases: (b.aliases || []).filter((a) => typeof a === 'string'), terms: b.terms || [] });
  if (!n.ok) throw new Error(n.error);
  return (await store.saveBrand(b.id, n.brand)).id;
}

$('#brandSearch').addEventListener('click', async () => {
  const b = await brandInputSpec();
  if (!b) { $('#brandInput').focus(); return; }
  currentBrand = b.id;
  const r = await chrome.runtime.sendMessage({ type: 'job:start', kind: 'marca', brand: $('#brandInput').value.trim() });
  if (r && r.busy) showBox('#brandStatus', 'Já existe uma varredura em andamento. Aguarde terminar.', true);
  renderBrandMode();
});
$('#brandInput').addEventListener('change', async () => { const b = await brandInputSpec(); if (b) { currentBrand = b.id; renderBrandMode(); } });
// Enquanto digita: favoritar/monitorar refletem a marca DIGITADA (não a anterior).
let brandTyping = null;
$('#brandInput').addEventListener('input', () => {
  clearTimeout(brandTyping);
  brandTyping = setTimeout(async () => {
    const b = await brandInputSpec();
    const { brandFavs } = await store.getBrandData();
    $('#brandFav').textContent = b && brandFavs.includes(b.id) ? '★ Favorita' : '☆ Favoritar';
    if (!monitorIntent) $('#brandMonitor').checked = !!(b && (settingsCache.monitorBrands || []).includes(b.id));
  }, 150);
});
$('#brandFav').addEventListener('click', async () => {
  const b = await brandInputSpec();
  if (!b) return;
  await store.toggleBrandFav(await ensureRegistered(b)); // marca digitada/sugerida entra em "Minhas marcas"
  renderBrandMode();
});
// Intenção do clique em "Monitorar" enquanto o salvamento não termina: impede que um redesenho
// (ex.: o "change" do campo ao perder o foco) desfaça o clique na tela.
let monitorIntent = null;
$('#brandMonitor').addEventListener('change', async (e) => {
  monitorIntent = { input: $('#brandInput').value.trim(), value: e.target.checked };
  const b = await brandInputSpec();
  if (!b) { e.target.checked = false; monitorIntent = null; return; }
  try {
    const on = monitorIntent.value;
    const id = on ? await ensureRegistered(b) : b.id;
    settingsCache.monitorBrands = await store.setBrandMonitor(id, on); // várias marcas ao mesmo tempo
  } finally {
    monitorIntent = null;
    renderBrandMode();
  }
});

// ---------- Cadastro de marcas (criar / editar / excluir) ----------
function fillForm(id) {
  const b = id ? userBrands[id] : null;
  $('#bfId').value = id || '';
  $('#bfName').value = b ? b.name : ($('#brandInput').value.trim() || '');
  $('#bfAliases').value = b ? b.aliases.filter((a) => a !== b.aliases[0]).join(', ') : '';
  $('#bfTerms').value = b ? b.terms.join(', ') : '';
  $('#bfSave').textContent = id ? 'Salvar alterações' : 'Cadastrar marca';
  $('#bfCancel').hidden = !id;
  $('#bfMsg').textContent = ''; $('#bfMsg').className = 'muted';
  $('#brandManager').open = true;
}
$('#bfCancel').addEventListener('click', () => fillForm(null));
$('#brandForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#bfMsg');
  const n = normalizeBrand({ name: $('#bfName').value, aliases: $('#bfAliases').value, terms: $('#bfTerms').value });
  if (!n.ok) { msg.textContent = n.error; msg.className = 'error'; return; }
  try {
    const editing = $('#bfId').value;
    const { id, created } = await store.saveBrand(editing || brandSlug(n.brand.name), n.brand, { mode: editing ? 'edit' : 'create' });
    msg.textContent = created ? `"${n.brand.name}" cadastrada.` : `"${n.brand.name}" atualizada.`;
    msg.className = 'muted';
    $('#bfId').value = ''; $('#bfName').value = ''; $('#bfAliases').value = ''; $('#bfTerms').value = '';
    $('#bfSave').textContent = 'Cadastrar marca'; $('#bfCancel').hidden = true;
    userBrands = (await store.getBrandData()).brands;
    currentBrand = id;
    $('#brandInput').value = n.brand.name;
    renderBrandMode();
  } catch (err) { msg.textContent = err.message || String(err); msg.className = 'error'; }
});
['#bCat', '#bLabel', '#bCompat', '#bSort'].forEach((x) => $(x).addEventListener('change', renderBrandResults));
['#bMin', '#bMax'].forEach((x) => $(x).addEventListener('input', renderBrandResults));

function showBox(sel, msg, isError = false) {
  const box = $(sel);
  if (!msg) { box.hidden = true; return; }
  box.hidden = false;
  box.className = 'status' + (isError ? ' error' : '');
  box.textContent = msg;
}

function renderJobStatus(st) {
  const kind = st && st.job && st.job.kind;
  if (kind === 'marca') showBox('#brandStatus', st.running ? `${st.message || 'Buscando…'} (${st.done}/${st.total} consultas · ${st.found || 0} anúncios lidos)` : `${st.job.label}: ${st.message || ''}`, !st.running && !st.found);
  if (kind === 'categoria') showBox('#catStatus', st.running ? `${st.message || 'Buscando…'} (${st.done}/${st.total} páginas)` : `${st.job.label}: ${st.message || ''}`, !st.running && !st.found);
}

async function renderBrandMode() {
  const { brandFavs, brands, brandSearches } = await store.getBrandData();
  userBrands = brands;
  const monitored = settingsCache.monitorBrands || [];
  // datalist: cadastro + sugestões (o campo aceita QUALQUER texto mesmo assim)
  const names = [...new Set([...Object.values(brands), ...Object.values(SUGGESTIONS)].map((b) => b.name))];
  $('#brandList').replaceChildren(...names.map((n) => { const o = el('option'); o.value = n; return o; }));
  const pick = (id) => { $('#brandInput').value = brandName(id); currentBrand = id; renderBrandMode(); };
  $('#brandFavs').replaceChildren(...(brandFavs.length ? brandFavs.map((id) => chip('★ ' + brandName(id), id === currentBrand, () => pick(id))) : [el('span', 'muted', 'nenhuma')]));
  $('#brandMonitored').replaceChildren(...(monitored.length ? monitored.map((id) => chip(brandName(id) + ' ✕', false, async () => { settingsCache.monitorBrands = await store.setBrandMonitor(id, false); renderBrandMode(); }, 'parar de monitorar')) : [el('span', 'muted', 'nenhuma')]));
  // sugestões: só preenchem o campo de busca (atalhos), não são cadastro
  $('#brandSuggestions').replaceChildren(...Object.entries(SUGGESTIONS).map(([id, b]) => chip(b.name, id === currentBrand, () => { $('#brandInput').value = b.name; currentBrand = id; renderBrandMode(); }, 'atalho: preenche a busca')));
  // cadastro do usuário
  const regIds = Object.keys(brands).sort((a, c) => brands[a].name.localeCompare(brands[c].name));
  $('#brandRegistry').replaceChildren(...(regIds.length ? regIds.map((id) => {
    const b = brands[id];
    const li = el('li', 'brand-row');
    const g = el('div', 'grow');
    const nm = el('button', 'link', b.name);
    nm.addEventListener('click', () => pick(id));
    g.append(nm, el('div', 'sub', `apelidos: ${b.aliases.join(', ') || '—'} · linhas: ${b.terms.join(', ') || 'descobertas automaticamente'}`));
    const act = el('div', 'actions');
    act.append(chip(brandFavs.includes(id) ? '★ favorita' : '☆ favoritar', brandFavs.includes(id), async () => { await store.toggleBrandFav(id); renderBrandMode(); }));
    const mon = el('label');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = monitored.includes(id); cb.className = 'reg-monitor'; cb.dataset.id = id;
    cb.addEventListener('change', async () => { settingsCache.monitorBrands = await store.setBrandMonitor(id, cb.checked); renderBrandMode(); });
    mon.append(cb, document.createTextNode('monitorar'));
    const ed = el('button', 'ghost', 'Editar'); ed.type = 'button'; ed.addEventListener('click', () => fillForm(id));
    const del = el('button', 'ghost danger', 'Excluir'); del.type = 'button';
    del.addEventListener('click', async () => {
      if (!confirm(`Excluir a marca "${b.name}" do cadastro? Ela sai dos favoritos e do monitoramento. As ofertas já encontradas continuam.`)) return;
      await store.deleteBrand(id);
      settingsCache = await store.getSettings();
      renderBrandMode();
    });
    act.append(mon, ed, del);
    li.append(g, act);
    return li;
  }) : [el('li', 'empty', 'Nenhuma marca cadastrada. Use o formulário acima, ou favorite/monitore uma marca pesquisada.')]));
  if (!$('#bfId').value && !$('#bfName').value && $('#brandInput').value.trim() && !brands[brandSlug($('#brandInput').value)]) $('#bfName').placeholder = $('#brandInput').value.trim();
  const b = await brandInputSpec();
  $('#brandFav').textContent = b && brandFavs.includes(b.id) ? '★ Favorita' : '☆ Favoritar';
  $('#brandMonitor').checked = monitorIntent && monitorIntent.input === $('#brandInput').value.trim()
    ? monitorIntent.value
    : !!(b && (settingsCache.monitorBrands || []).includes(b.id));
  $('#brandHistory').replaceChildren(...(brandSearches.length ? brandSearches.slice(0, 20).map((h) => {
    const li = el('li');
    const g = el('div', 'grow');
    const btn = el('button', 'link', h.name);
    btn.addEventListener('click', () => pick(h.brand));
    const cats = Object.entries(h.categories || {}).sort((a, c) => c[1] - a[1]).map(([c, n]) => `${(CATEGORY_BY_ID[c] || { name: c }).name} ${n}`).join(', ');
    g.append(btn, el('div', 'sub', `${new Date(h.t).toLocaleString('pt-BR')} · ${h.found} lidos · ${h.kept} da marca · ${h.compat} compatíveis (terceiros) · ${h.excluded} descartados (outra marca/irrelevantes) · ${h.ok}/${h.sources} consultas OK` + (cats ? ` · categorias: ${cats}` : '') + (h.learnedTerms && h.learnedTerms.length ? ` · linhas descobertas: ${h.learnedTerms.join(', ')}` : '') + (h.stoppedReason ? ` · interrompida: ${h.stoppedReason}` : '')));
    li.append(g);
    return li;
  }) : [el('li', 'empty', 'Nenhuma busca por marca ainda.')]));
  renderBrandResults();
}

function renderBrandResults() {
  const id = currentBrand;
  const out = $('#brandResults');
  if (!id) { out.replaceChildren(); $('#brandSummary').textContent = 'Escolha ou digite uma marca e clique em "Buscar marca".'; return; }
  const all = scored.filter((o) => o.brands && o.brands[id]);
  const showCompat = $('#bCompat').checked;
  const min = Number($('#bMin').value) || 0, max = Number($('#bMax').value) || Infinity;
  const cat = $('#bCat').value, lbl = $('#bLabel').value;
  // opções de categoria a partir do que foi encontrado
  const cats = [...new Set(all.map((o) => o.category))];
  const sel = $('#bCat');
  const keep = sel.value;
  sel.replaceChildren(el('option', '', 'Todas as categorias'), ...cats.map((c) => { const op = el('option', '', (CATEGORY_BY_ID[c] || { name: c }).name); op.value = c; return op; }));
  sel.firstChild.value = '';
  sel.value = cats.includes(keep) ? keep : '';
  const list = all.filter((o) => (showCompat || o.brands[id] !== 'compativel') && o.price >= min && o.price <= max && (!cat || o.category === cat) && labelOk(o, lbl));
  const sort = $('#bSort').value;
  list.sort(sort === 'price' ? (a, b) => a.price - b.price : sort === '-price' ? (a, b) => b.price - a.price : (a, b) => b.score - a.score);
  const own = all.filter((o) => o.brands[id] !== 'compativel').length;
  const name = userBrands[id] || SUGGESTIONS[id] ? brandName(id) : ($('#brandInput').value || id);
  $('#brandSummary').textContent = `${name}: ${own} produto(s) da marca e ${all.length - own} acessório(s) compatível(is) de terceiros encontrados · mostrando ${list.length}. Organizados por categoria.`;
  const groups = new Map();
  for (const o of list) { if (!groups.has(o.category)) groups.set(o.category, []); groups.get(o.category).push(o); }
  out.replaceChildren(...(list.length ? [...groups.entries()].map(([c, items]) => {
    const g = el('div', 'cat-group');
    g.append(el('h4', '', `${(CATEGORY_BY_ID[c] || { name: c }).name} (${items.length})`));
    const ul = el('ul', 'offers');
    ul.replaceChildren(...items.slice(0, 60).map(offerCard));
    g.append(ul);
    return g;
  }) : [el('p', 'empty', all.length ? 'Nenhum resultado com os filtros atuais.' : 'Nenhum resultado desta marca ainda. Clique em "Buscar marca".')]));
}

// ---------- Categoria ----------
const catSel = $('#catSelect');
catSel.replaceChildren(...CATEGORIES.filter((c) => c.ml).map((c) => { const o = el('option', '', c.name); o.value = c.id; return o; }));
$('#catSearch').addEventListener('click', async () => {
  currentCategory = catSel.value;
  const r = await chrome.runtime.sendMessage({ type: 'job:start', kind: 'categoria', category: currentCategory });
  if (r && r.busy) showBox('#catStatus', 'Já existe uma varredura em andamento. Aguarde terminar.', true);
  renderCategoryMode();
});
['#cSort', '#cLabel', '#catSelect'].forEach((x) => $(x).addEventListener('change', () => { currentCategory = catSel.value; renderCategoryMode(); }));
function renderCategoryMode() {
  const c = currentCategory || catSel.value;
  const list = scored.filter((o) => o.category === c && labelOk(o, $('#cLabel').value));
  list.sort($('#cSort').value === 'price' ? (a, b) => a.price - b.price : (a, b) => b.score - a.score);
  $('#catSummary').textContent = `${(CATEGORY_BY_ID[c] || {}).name}: ${list.length} oferta(s).`;
  $('#catResults').replaceChildren(...(list.length ? list.slice(0, 120).map(offerCard) : [el('li', 'empty', 'Nenhuma oferta desta categoria ainda.')]));
}

// ---------- Relatório de classificação (dados reais armazenados) ----------
let lastReport = null;
$('#reportBtn').addEventListener('click', async () => {
  const r = await store.getRadar();
  lastReport = classificationReport(r.offers, r.prices, Date.now(), weights);
  renderReport(lastReport);
  $('#reportCopy').hidden = false;
});
$('#reportCopy').addEventListener('click', (ev) => copy(JSON.stringify({ radarDeOfertas: chrome.runtime.getManifest().version, relatorio: lastReport }, null, 2), ev.target, 'Copiado ✓'));
function table(rows, head) {
  const t = el('table');
  if (head) { const tr = el('tr'); head.forEach((h) => tr.append(el('th', '', h))); t.append(tr); }
  for (const r of rows) { const tr = el('tr'); r.forEach((v) => tr.append(el('td', '', String(v)))); t.append(tr); }
  return t;
}
function renderReport(rep) {
  const box = $('#reportOut');
  if (!rep.total) { box.replaceChildren(el('p', 'muted', 'Nenhuma oferta armazenada ainda. Rode o radar primeiro.')); return; }
  const n = rep.novo.notas, a = rep.antigo.notas;
  box.replaceChildren(
    el('p', '', `${rep.total} ofertas armazenadas (dados reais deste navegador).`),
    table([['Mínima', a.min, n.min], ['Máxima', a.max, n.max], ['Média', a.media, n.media], ['Mediana', a.mediana, n.mediana]], ['Nota', 'v0.5.1 (antiga)', 'v0.6.0 (nova)']),
    table(Object.keys(rep.antigo.faixas).map((k) => [k, rep.antigo.faixas[k], rep.novo.faixas[k]]), ['Faixa de nota', 'antiga', 'nova']),
    table(Object.entries(rep.antigo.classes), ['Classe antiga', 'Ofertas']),
    table(Object.entries(rep.novo.classes), ['Classe nova', 'Ofertas']),
    table(Object.entries(rep.novo.descontoReal), ['Desconto real (A)', 'Ofertas']),
    table(Object.entries(rep.penalidades), ['Critério que penaliza', 'Ofertas afetadas']),
    table(Object.entries(rep.impactoDoHistorico), ['Impacto do histórico', 'Valor'])
  );
}

// Modo inicial: "Produto" (preserva a busca manual existente)
setMode('produto');

// Aba ativa no carregamento (app.js pode ter trocado de aba antes deste módulo carregar).
const active = document.querySelector('.tabs button.active');
if (active) { view = { name: active.dataset.tab, group: active.dataset.group || '' }; if (view.name === 'ofertas') fillCategorySelect(); }

loadSettings();
refresh();
