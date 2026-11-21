// Painel de oportunidades: controle do radar, listas por categoria, filtros, cópia de ofertas.
// A varredura roda no service worker (background.js / lib/discovery.js); este painel só
// envia comandos e acompanha o progresso pelo chrome.storage.

import { CATEGORIES, CATEGORY_BY_ID, GROUPS } from './lib/categories.js';
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
    if (lbl === 'suspeito' && o.label !== 'suspeito') return false;
    if (lbl && lbl !== 'suspeito' && LABEL_RANK[o.label] < LABEL_RANK[lbl]) return false;
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
  } else if (o.discountKind === 'anunciado') {
    prev.textContent = `de R$ ${fmt(o.originalPrice)}`;
    prev.classList.add('strike');
    disc.textContent = `${o.discountPct.toFixed(0)}% OFF anunciado`;
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
  const sb = o.subscores || {};
  node.querySelector('.o-sub').textContent = `Preço: ${o.attractiveness == null ? 'sem referência' : o.attractiveness + '/100'}` +
    ` (${o.peers} equivalente${o.peers === 1 ? '' : 's'})` +
    ` · Comprovação do desconto: ${sb.comprovacao || 0}/100 · Desconto anunciado: ${sb.anunciado || 0}/100`;
  const tags = [];
  if (o.accessory) tags.push('acessório');
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
    const top = scored.filter((o) => o.label !== 'suspeito').sort((a, b) => b.score - a.score).slice(0, 30);
    $('#topOffers').replaceChildren(...(top.length ? top.map(offerCard) : [el('li', 'empty', 'Nenhuma oferta ainda. Clique em "Iniciar Radar".')]));
  } else if (view.name === 'ofertas') {
    const list = applyFilters(scored);
    const shown = list.slice(0, 300);
    const groupName = view.group ? (GROUPS.find((g) => g.id === view.group) || {}).name : 'Todas as ofertas';
    $('#offerCount').textContent = `${groupName}: ${list.length} oferta(s)` + (list.length > shown.length ? ` (mostrando ${shown.length})` : '') + ` de ${scored.length} encontradas pelo radar.`;
    $('#offerList').replaceChildren(...(shown.length ? shown.map(offerCard) : [el('li', 'empty', scored.length ? 'Nenhuma oferta com os filtros atuais.' : 'Nenhuma oferta ainda. Clique em "Iniciar Radar".')]));
  }
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
  scored = scoreAll(Object.values(r.offers), r.prices, Date.now(), weights);
  renderState(r.radarState, r.scans);
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
  if (!['offers', 'radarState', 'scans', 'watch', 'prices', 'sourceStats'].some((k) => k in changes)) return;
  clearTimeout(pending);
  pending = setTimeout(refresh, 250); // agrupa várias gravações seguidas
});

document.addEventListener('radar:tab', (e) => {
  view = e.detail;
  if (view.name === 'ofertas') fillCategorySelect();
  renderOffers();
  if (view.name === 'historico') { store.getRadar().then((r) => renderScans(r.scans)); renderAudit(); }
});

// Aba ativa no carregamento (app.js pode ter trocado de aba antes deste módulo carregar).
const active = document.querySelector('.tabs button.active');
if (active) { view = { name: active.dataset.tab, group: active.dataset.group || '' }; if (view.name === 'ofertas') fillCategorySelect(); }

loadSettings();
refresh();
