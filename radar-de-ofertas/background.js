// Service worker do Radar de Ofertas (Manifest V3).
//  - clique no ícone: abre (ou foca) o painel de oportunidades;
//  - mensagens do painel: iniciar/parar o radar;
//  - chrome.alarms: monitoramento periódico enquanto o navegador estiver aberto;
//  - notificações de novas oportunidades boas encontradas no monitoramento;
//  - menu de contexto "Buscar no Radar de Ofertas" (busca manual).

import { runRadar, requestStop, isRunning, newGoodOffers } from './lib/discovery.js';
import { getSettings } from './lib/storage.js';

const PANEL = 'app.html';
const MIN_INTERVAL = 30; // minutos — respeita os limites das fontes

async function openPanel(query = '') {
  const base = chrome.runtime.getURL(PANEL);
  const tabs = await chrome.tabs.query({ url: base + '*' });
  if (tabs.length && !query) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: base + '?full=1' + (query ? '&tab=buscar&q=' + encodeURIComponent(query) : '') });
}

chrome.action.onClicked.addListener(() => openPanel());

async function syncAlarm() {
  const s = await getSettings();
  await chrome.alarms.clear('radar');
  if (s.interval > 0) chrome.alarms.create('radar', { periodInMinutes: Math.max(MIN_INTERVAL, s.interval), delayInMinutes: Math.max(MIN_INTERVAL, s.interval) });
}

chrome.runtime.onInstalled.addListener(() => {
  // removeAll evita o erro "duplicate id" quando a extensão é atualizada/recarregada.
  chrome.contextMenus.removeAll(() => chrome.contextMenus.create({
    id: 'radar-buscar',
    title: 'Buscar "%s" no Radar de Ofertas',
    contexts: ['selection']
  }));
  syncAlarm();
});
chrome.runtime.onStartup.addListener(syncAlarm);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) syncAlarm();
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== 'radar-buscar' || !info.selectionText) return;
  openPanel(info.selectionText.trim().slice(0, 120));
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'radar' || isRunning()) return;
  const scan = await runRadar('auto');
  const s = await getSettings();
  if (!s.notify) return;
  const good = await newGoodOffers(scan, 'boa');
  if (!good.length) return;
  const top = good[0];
  chrome.notifications.create('radar-' + scan.t, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `Radar de Ofertas: ${good.length} nova(s) oportunidade(s)`,
    message: `${top.labelText}: ${top.title.slice(0, 80)} — R$ ${top.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  });
});

chrome.notifications.onClicked.addListener(() => openPanel());

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target === 'offscreen') return;
  if (msg.type === 'radar:start') {
    const already = isRunning();
    runRadar('manual'); // segue em segundo plano; o painel acompanha pelo chrome.storage
    sendResponse({ started: !already, running: true });
  } else if (msg.type === 'radar:stop') {
    requestStop();
    sendResponse({ ok: true });
  } else if (msg.type === 'radar:status') {
    sendResponse({ running: isRunning() });
  }
});
