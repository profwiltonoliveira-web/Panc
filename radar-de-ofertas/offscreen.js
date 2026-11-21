// Documento offscreen (Manifest V3): o service worker não tem DOMParser, então a leitura
// direta das páginas públicas do Mercado Livre (fetch + análise do HTML) acontece aqui.
import './lib/ml-parser.js';

const ML = globalThis.RadarML;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen' || msg.type !== 'read') return;
  readDirect(msg.url, msg.version).then(sendResponse, (e) => sendResponse({ items: [], error: String(e.message || e), diagnostic: null }));
  return true; // resposta assíncrona
});

// Obs.: documentos offscreen só têm a API de mensagens (sem chrome.runtime.getManifest);
// a versão vem na mensagem.
async function readDirect(url, version) {
  const res = await fetch(url, { credentials: 'include' });
  const meta = { finalUrl: res.url, status: res.status, origin: 'leitura-direta', version: version || null };
  if (/account-verification|\/gz\/|captcha/i.test(res.url)) {
    return { items: [], error: 'verificação de segurança', diagnostic: { ...meta, tipoDePagina: 'verificacao' } };
  }
  if (!res.ok) return { items: [], error: `HTTP ${res.status}`, diagnostic: { ...meta, tipoDePagina: 'erro-http' } };
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const parsed = ML.parseSearchDocument(doc);
  const diagnostic = ML.diagnoseDocument(doc, { ...meta, htmlLength: html.length, parsed });
  return { items: parsed.items, diagnostic, error: parsed.items.length ? null : 'nenhum anúncio reconhecido' };
}
