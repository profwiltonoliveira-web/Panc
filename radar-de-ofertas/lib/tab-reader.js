// Leitura de anúncios a partir de uma ABA do Mercado Livre aberta no navegador do usuário.
//
// Por que: a página de busca do ML monta os cards com JavaScript e pode exigir verificação
// de segurança. Uma requisição direta (fetch) não executa esse JavaScript nem passa pela
// verificação. Já a aba é a página normal, vista pelo usuário, com a sessão dele.
//
// Como (Manifest V3, métodos autorizados):
//  - chrome.tabs.create / chrome.tabs.query para abrir/encontrar a aba de resultados;
//  - chrome.scripting.executeScript para injetar lib/ml-parser.js (só leitura do DOM) e
//    chamar __radarExtract(), que devolve anúncios + diagnóstico.
// Se a aba mostrar verificação de segurança, NADA é contornado: o usuário conclui a
// verificação na própria aba e depois pede a leitura de novo.

import { searchUrl } from './mercadolivre.js';

const ML_TAB_PATTERNS = ['https://lista.mercadolivre.com.br/*', 'https://www.mercadolivre.com.br/*'];

export class TabReadError extends Error {
  constructor(message, { diagnostic = null, tabId = null, needsUser = false } = {}) {
    super(message);
    this.diagnostic = diagnostic;
    this.tabId = tabId;
    this.needsUser = needsUser; // true: o usuário precisa agir na aba (verificação/login)
  }
}

function isSearchUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.hostname === 'lista.mercadolivre.com.br') return true;
    return u.hostname === 'www.mercadolivre.com.br' && (u.pathname.startsWith('/jm/search') || u.searchParams.has('as_word'));
  } catch { return false; }
}

/** Abas de resultados do ML abertas, da usada mais recentemente para a mais antiga. */
export async function findSearchTabs() {
  const tabs = await chrome.tabs.query({ url: ML_TAB_PATTERNS });
  return tabs.filter((t) => isSearchUrl(t.url)).sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
}

function waitForComplete(tabId, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new TabReadError('A aba do Mercado Livre demorou demais para carregar.', { tabId })); }, timeoutMs);
    const listener = (id, info) => { if (id === tabId && info.status === 'complete') { cleanup(); resolve(); } };
    const removed = (id) => { if (id === tabId) { cleanup(); reject(new TabReadError('A aba do Mercado Livre foi fechada.', { tabId })); } };
    function cleanup() { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); chrome.tabs.onRemoved.removeListener(removed); }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.onRemoved.addListener(removed);
    chrome.tabs.get(tabId).then((t) => { if (t.status === 'complete') { cleanup(); resolve(); } }).catch(() => {});
  });
}

/** Injeta o parser na aba e devolve { items, query, diagnostic }. */
export async function extractFromTab(tabId) {
  const version = chrome.runtime.getManifest().version;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['lib/ml-parser.js'] });
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (v) => globalThis.__radarExtract({ timeout: 8000, version: v }),
      args: [version]
    });
    if (!res || !res.result) throw new Error('a aba não devolveu resposta');
    return res.result;
  } catch (e) {
    if (e instanceof TabReadError) throw e;
    throw new TabReadError('Não foi possível ler a aba do Mercado Livre: ' + (e.message || e), { tabId });
  }
}

function checkResult(r, tabId) {
  const d = r.diagnostic;
  if (r.items.length) return r;
  if (d.tipoDePagina === 'verificacao') {
    throw new TabReadError('O Mercado Livre pediu uma verificação de segurança na aba aberta. Conclua a verificação nessa aba e depois clique em "Ler aba do ML".', { diagnostic: d, tabId, needsUser: true });
  }
  if (d.tipoDePagina === 'login') {
    throw new TabReadError('O Mercado Livre pediu login na aba aberta. Entre na sua conta nessa aba e depois clique em "Ler aba do ML".', { diagnostic: d, tabId, needsUser: true });
  }
  if (d.tipoDePagina === 'bloqueio') {
    throw new TabReadError('O Mercado Livre bloqueou o acesso a esta página ("Hubo un error accediendo a esta pagina"). Isso costuma acontecer com VPN, proxy, rede corporativa ou excesso de acessos. Abra mercadolivre.com.br normalmente, faça a busca no site e clique em "Ler aba do ML".', { diagnostic: d, tabId, needsUser: true });
  }
  if (d.tipoDePagina === 'sem-resultados') {
    throw new TabReadError('O Mercado Livre não encontrou anúncios para esse termo.', { diagnostic: d, tabId });
  }
  throw new TabReadError('A aba do Mercado Livre abriu, mas nenhum anúncio foi reconhecido. Copie o diagnóstico e envie para ajuste dos seletores.', { diagnostic: d, tabId });
}

/**
 * Busca abrindo (em segundo plano) a página de resultados do termo, ou reaproveitando uma aba
 * já aberta com o mesmo termo. Fecha a aba se foi criada aqui e a leitura deu certo.
 */
export async function searchViaTab(query) {
  const target = searchUrl(query);
  const existing = (await findSearchTabs()).find((t) => t.url.split('#')[0].split('?')[0] === target);
  let tabId, created = false;
  if (existing) tabId = existing.id;
  else {
    const tab = await chrome.tabs.create({ url: target, active: false });
    tabId = tab.id;
    created = true;
  }
  await waitForComplete(tabId);
  const r = await extractFromTab(tabId);
  try {
    checkResult(r, tabId);
  } catch (e) {
    e.created = created; // a aba fica aberta para o usuário agir/ver
    throw e;
  }
  if (created) chrome.tabs.remove(tabId).catch(() => {});
  return r;
}

/** Lê a aba de resultados do ML que o usuário estiver vendo (ou a usada mais recentemente). */
export async function readOpenTab() {
  let tab = null;
  try {
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (active && isSearchUrl(active.url)) tab = active;
  } catch { /* ignore */ }
  if (!tab) tab = (await findSearchTabs())[0] || null;
  if (!tab) {
    throw new TabReadError('Nenhuma página de resultados do Mercado Livre está aberta. Faça a busca em mercadolivre.com.br (ou clique em Buscar) e tente de novo.');
  }
  if (tab.status !== 'complete') await waitForComplete(tab.id);
  const r = await extractFromTab(tab.id);
  return checkResult(r, tab.id);
}

export async function focusTab(tabId) {
  const tab = await chrome.tabs.update(tabId, { active: true });
  if (tab && tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
}
