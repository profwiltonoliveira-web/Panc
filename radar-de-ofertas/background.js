// Menu de contexto: selecione um texto em qualquer página → "Buscar no Radar de Ofertas".
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'radar-buscar',
    title: 'Buscar "%s" no Radar de Ofertas',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== 'radar-buscar' || !info.selectionText) return;
  const q = info.selectionText.trim().slice(0, 120);
  chrome.tabs.create({ url: chrome.runtime.getURL('app.html?full=1&q=' + encodeURIComponent(q)) });
});
