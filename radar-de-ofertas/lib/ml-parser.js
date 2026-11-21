// Parser de páginas de resultados do Mercado Livre.
// Script CLÁSSICO (sem import/export) porque é injetado como content script na aba do ML
// via chrome.scripting.executeScript. Também é importado pelo módulo lib/mercadolivre.js.
// Tudo fica dentro de uma IIFE para poder ser injetado mais de uma vez na mesma aba.
//
// Três estratégias independentes, para resistir a mudanças de layout:
//   A) "json":  dados dos cards ("polycard") embutidos em <script> da página
//   B) "dom":   cards renderizados (li.ui-search-layout__item / div.poly-card)
//   C) "links": varredura genérica de links de anúncio + preço no mesmo bloco
// Nada é inventado: só entram anúncios com título, link do ML e preço lidos da página.

(function () {
  const ML_HOST_RE = /^([a-z0-9-]+\.)*mercadoli(vre|bre)\.com(\.br)?$/i;
  const CARD_SEL = 'li.ui-search-layout__item, div.poly-card, div.ui-search-result__wrapper, div.andes-card.poly-card';
  const ITEM_HREF_RE = /\/MLB-\d{6,}|\/p\/MLB\d{6,}|[?&#](wid|item_id)=MLB\d{6,}|\/up\/MLBU\d{6,}/i;

  // ---------- utilidades ----------
  function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  function parseBRL(s) {
    const n = Number(String(s).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function safeLink(href) {
    if (!href) return null;
    try {
      const u = new URL(href, 'https://www.mercadolivre.com.br/');
      return u.protocol === 'https:' && ML_HOST_RE.test(u.hostname) ? u.href : null;
    } catch { return null; }
  }

  function safeImage(url) {
    if (!url) return '';
    try {
      const u = new URL(String(url).replace(/^http:/, 'https:'));
      if (u.protocol !== 'https:' || !/(^|\.)mlstatic\.com$/i.test(u.hostname)) return '';
      return u.href.replace(/-I\.(jpg|webp)$/i, '-O.$1');
    } catch { return ''; }
  }

  function idFromUrl(url) {
    if (!url) return null;
    let u;
    try { u = new URL(url, 'https://www.mercadolivre.com.br/'); } catch { return null; }
    const hashParams = new URLSearchParams(u.hash.replace(/^#/, ''));
    const wid = u.searchParams.get('wid') || u.searchParams.get('item_id') || hashParams.get('wid');
    if (wid && /^MLB\d{6,}$/i.test(wid)) return wid.toUpperCase();
    const path = u.pathname;
    let m = path.match(/\/MLB-(\d{6,})(?:[-_/]|$)/i);
    if (m) return 'MLB' + m[1];
    m = path.match(/\/p\/(MLB\d{6,})(?:[/?]|$)/i);
    if (m) return 'P:' + m[1].toUpperCase();
    m = path.match(/\/up\/(MLBU\d{6,})(?:[/?]|$)/i);
    if (m) return 'U:' + m[1].toUpperCase();
    m = path.match(/\/(MLB\d{6,})(?:[/?_-]|$)/i);
    if (m) return m[1].toUpperCase();
    return null;
  }

  function titleKey(title) {
    return 'T:' + String(title || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80);
  }

  function pick(root, selectors) {
    for (const s of selectors) {
      const el = root.querySelector(s);
      if (el) return el;
    }
    return null;
  }

  function shippingFromText(text) {
    const t = String(text || '').toLowerCase();
    const free = /frete gr[aá]tis|envio gr[aá]tis|chegar[aá] gr[aá]tis|entrega gr[aá]tis/.test(t);
    if (free) return { shipping: 0, freeShipping: true };
    const m = t.match(/frete\s*(?:de)?\s*r\$\s*([\d.]+(?:,\d{2})?)/);
    return { shipping: m ? parseBRL(m[1]) : null, freeShipping: false };
  }

  function conditionFromText(text) {
    const t = String(text || '').toLowerCase();
    return /\brecondicionado\b/.test(t) ? 'recondicionado' : /\busado\b/.test(t) ? 'usado' : null;
  }

  function makeItem(o) {
    const link = safeLink(o.link);
    const title = clean(o.title);
    if (!link || !title || !(o.price > 0)) return null;
    let originalPrice = o.originalPrice > o.price ? o.originalPrice : null;
    return {
      id: idFromUrl(link) || titleKey(title),
      title,
      price: Math.round(o.price * 100) / 100,
      originalPrice,
      currency: 'BRL',
      shipping: o.shipping == null ? null : o.shipping,
      freeShipping: !!o.freeShipping,
      condition: o.condition || null,
      image: safeImage(o.image),
      link,
      seller: o.seller ? clean(o.seller).replace(/^por\s+/i, '') : null,
      installments: null
    };
  }

  // ---------- A) JSON "polycard" embutido em <script> ----------
  // Extrai o objeto JSON que começa em text[start] === '{', respeitando strings.
  function sliceJsonObject(text, start) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
    }
    return null;
  }

  function findDeep(obj, pred, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 8) return undefined;
    if (pred(obj)) return obj;
    for (const k in obj) {
      const r = findDeep(obj[k], pred, depth + 1);
      if (r !== undefined) return r;
    }
    return undefined;
  }

  function textOf(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') return v.text || v.label || (Array.isArray(v.values) ? v.values.map(textOf).join(' ') : '') || '';
    return String(v);
  }

  function polycardToItem(pc) {
    const md = pc.metadata || {};
    const comps = Array.isArray(pc.components) ? pc.components : [];
    const comp = (type) => { const c = comps.find((x) => x && x.type === type); return c ? (c[type] || c) : null; };
    const title = textOf(comp('title') && (comp('title').text != null ? comp('title').text : comp('title')));
    const priceC = comp('price') || {};
    const cur = findDeep(priceC.current_price || priceC, (o) => typeof o.value === 'number');
    const prev = priceC.previous_price ? findDeep(priceC.previous_price, (o) => typeof o.value === 'number') : null;
    let link = md.url || '';
    if (link && !/^https?:/i.test(link)) link = 'https://' + link.replace(/^\/+/, '');
    if (link && md.url_params && !link.includes('?') && /^[?#]/.test(md.url_params)) link += md.url_params;
    // Garante wid para links de catálogo, quando o ID do anúncio está nos metadados.
    if (link && /\/p\/MLB/i.test(link) && md.id && /^MLB\d+$/.test(md.id) && !/wid=/.test(link)) {
      link += (link.includes('?') ? '&' : '?') + 'wid=' + md.id;
    }
    const shipText = textOf(comp('shipping')) + ' ' + textOf(comp('shipped_from'));
    const pics = pc.pictures && Array.isArray(pc.pictures.pictures) ? pc.pictures.pictures : [];
    const image = pics[0] && pics[0].id ? `https://http2.mlstatic.com/D_NQ_NP_${pics[0].id}-O.webp` : '';
    const seller = textOf(comp('seller'));
    const extra = textOf(comp('highlight')) + ' ' + textOf(comp('item_condition')) + ' ' + textOf(comp('condition'));
    return makeItem({
      title,
      link,
      price: cur ? cur.value : null,
      originalPrice: prev ? prev.value : null,
      ...shippingFromText(shipText),
      condition: conditionFromText(extra),
      image,
      seller
    });
  }

  function parseFromScripts(doc) {
    const out = [];
    let scriptsWithPolycard = 0, parsedObjects = 0, parseErrors = 0;
    for (const s of doc.querySelectorAll('script')) {
      const text = s.textContent || '';
      if (!text.includes('"polycard"')) continue;
      scriptsWithPolycard++;
      let idx = 0;
      while ((idx = text.indexOf('"polycard":', idx)) !== -1) {
        const start = text.indexOf('{', idx);
        idx = start + 1;
        if (start < 0) break;
        const raw = sliceJsonObject(text, start);
        if (!raw) { parseErrors++; continue; }
        try {
          const item = polycardToItem(JSON.parse(raw));
          parsedObjects++;
          if (item) out.push(item);
        } catch { parseErrors++; }
        idx = start + raw.length;
      }
    }
    return { items: out, scriptsWithPolycard, parsedObjects, parseErrors };
  }

  // ---------- B) Cards do DOM ----------
  function firstCurrentAmount(box) {
    for (const el of box.querySelectorAll('.andes-money-amount')) {
      if (el.tagName === 'S' || el.classList.contains('andes-money-amount--previous') || el.closest('s')) continue;
      if (el.closest('.poly-price__installments, .ui-search-installments, .poly-component__installments')) continue;
      return el;
    }
    return null;
  }

  function readMoney(el) {
    if (!el) return null;
    const frac = el.querySelector('.andes-money-amount__fraction');
    if (frac) {
      const cents = el.querySelector('.andes-money-amount__cents');
      const n = Number(frac.textContent.replace(/\D/g, '')) + (cents ? Number(cents.textContent.replace(/\D/g, '')) / 100 : 0);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    const aria = el.getAttribute && el.getAttribute('aria-label');
    const src = clean(aria || el.textContent);
    let m = src.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/);
    if (m) return parseBRL(m[1]);
    m = src.match(/(\d[\d.]*)\s*reais(?:\s*com\s*(\d{1,2})\s*centavos)?/i);
    return m ? parseBRL(m[1] + (m[2] ? ',' + m[2].padStart(2, '0') : '')) : null;
  }

  function parseCard(card) {
    const a = pick(card, ['a.poly-component__title', 'h3 a[href]', 'h2 a[href]', 'a.ui-search-item__group__element', 'a.ui-search-link']);
    const titleEl = pick(card, ['.poly-component__title', '.ui-search-item__title', 'h3', 'h2']);
    const currentBox = pick(card, ['.poly-price__current', '.ui-search-price__second-line', '.ui-search-price--size-medium']);
    const prevEl = pick(card, ['s.andes-money-amount', '.andes-money-amount--previous', '.ui-search-price__original-value']);
    const img = pick(card, ['img.poly-component__picture', 'img']);
    const sellerEl = pick(card, ['.poly-component__seller', '.ui-search-official-store-label']);
    const text = clean(card.textContent);
    return makeItem({
      title: (titleEl && titleEl.textContent) || (a && a.textContent),
      link: a && a.getAttribute('href'),
      price: readMoney(firstCurrentAmount(currentBox || card)),
      originalPrice: prevEl ? readMoney(prevEl) : null,
      ...shippingFromText(text),
      condition: conditionFromText(text),
      image: img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : '',
      seller: sellerEl && sellerEl.textContent
    });
  }

  function parseFromCards(doc) {
    const out = [];
    for (const card of doc.querySelectorAll(CARD_SEL)) {
      if (card.parentElement && card.parentElement.closest(CARD_SEL)) continue;
      const item = parseCard(card);
      if (item) out.push(item);
    }
    return out;
  }

  // ---------- C) Varredura genérica de links ----------
  function parseFromLinks(doc) {
    const out = [];
    const used = new Set();
    for (const a of doc.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href');
      if (!ITEM_HREF_RE.test(href)) continue;
      const link = safeLink(href);
      const id = link && idFromUrl(link);
      if (!id || used.has(id)) continue;
      // Sobe até achar um bloco com preço que contenha só este anúncio.
      let box = a.parentElement;
      for (let i = 0; box && i < 7; i++, box = box.parentElement) {
        const ids = new Set([...box.querySelectorAll('a[href]')].map((x) => idFromUrl(safeLink(x.getAttribute('href')))).filter(Boolean));
        if (ids.size > 1) { box = null; break; }
        if (box.querySelector('.andes-money-amount') || /R\$\s*\d/.test(box.textContent || '')) break;
      }
      if (!box) continue;
      const amount = firstCurrentAmount(box) || box;
      const prevEl = box.querySelector('s, .andes-money-amount--previous');
      const img = box.querySelector('img');
      const title = clean(a.getAttribute('title') || a.textContent) || (img && img.getAttribute('alt')) || '';
      const text = clean(box.textContent);
      const item = makeItem({
        title,
        link,
        price: readMoney(amount),
        originalPrice: prevEl ? readMoney(prevEl) : null,
        ...shippingFromText(text),
        condition: conditionFromText(text),
        image: img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : ''
      });
      if (item) { used.add(id); out.push(item); }
    }
    return out;
  }

  // ---------- Combinação ----------
  function dedupe(items) {
    const seen = new Map();
    for (const it of items) if (!seen.has(it.id)) seen.set(it.id, it);
    return [...seen.values()];
  }

  /**
   * Lê os anúncios de um Document (HTML baixado ou a página aberta na aba).
   * @returns {{ items: Array, strategy: string|null, counts: Object }}
   */
  function parseSearchDocument(doc) {
    const json = parseFromScripts(doc);
    const dom = parseFromCards(doc);
    const links = parseFromLinks(doc);
    let items = [], strategy = null;
    if (json.items.length) { items = json.items; strategy = 'json'; }
    else if (dom.length) { items = dom; strategy = 'dom'; }
    else if (links.length) { items = links; strategy = 'links'; }
    // Completa imagem/frete do JSON com o que o DOM mostrar para o mesmo anúncio.
    if (strategy === 'json' && dom.length) {
      const byId = new Map(dom.map((d) => [d.id, d]));
      for (const it of items) {
        const d = byId.get(it.id);
        if (!d) continue;
        if (!it.image && d.image) it.image = d.image;
        if (it.shipping == null && d.shipping != null) { it.shipping = d.shipping; it.freeShipping = d.freeShipping; }
        if (!it.condition && d.condition) it.condition = d.condition;
      }
    }
    return {
      items: dedupe(items),
      strategy,
      counts: { json: json.items.length, dom: dom.length, links: links.length, scriptsWithPolycard: json.scriptsWithPolycard, jsonParseErrors: json.parseErrors }
    };
  }

  /**
   * Diagnóstico estrutural da página (sem conteúdo pessoal: só URL, título, contagens e classes).
   */
  function diagnoseDocument(doc, meta) {
    meta = meta || {};
    const url = meta.finalUrl || (doc.location && doc.location.href) || '';
    const bodyText = clean(doc.body ? doc.body.textContent : '').toLowerCase();
    const html = meta.htmlLength != null ? meta.htmlLength : (doc.documentElement ? doc.documentElement.outerHTML.length : 0);
    const count = (s) => { try { return doc.querySelectorAll(s).length; } catch { return -1; } };
    let kind = 'desconhecida';
    if (/account-verification|\/gz\/|captcha/i.test(url) || /captcha|verifica[cç][aã]o de seguran|confirme que voc[eê] n[aã]o [eé] um rob/.test(bodyText) || count('iframe[src*="captcha"], .g-recaptcha, #captcha') > 0) kind = 'verificacao';
    else if (/hubo un error accediendo|houve um erro ao acessar|access denied|acesso negado/.test(bodyText) && count('a[href]') < 15) kind = 'bloqueio';
    else if (/não há anúncios|nao ha anuncios|nenhum resultado|verifique se a palavra|não encontramos/.test(bodyText)) kind = 'sem-resultados';
    else if (/\/p\/MLB\d|\/MLB-\d/i.test(url) && !/lista\./.test(url)) kind = 'pagina-de-produto';
    else if (/login|registration|\/jms\/.*\/lgz/i.test(url)) kind = 'login';
    const parsed = meta.parsed || parseSearchDocument(doc);
    if (parsed.items.length && kind === 'desconhecida') kind = 'resultados';
    // Classes mais frequentes relacionadas à busca, para ajustar seletores.
    const freq = {};
    for (const el of doc.querySelectorAll('[class]')) {
      for (const c of String(el.className && el.className.baseVal != null ? el.className.baseVal : el.className).split(/\s+/)) {
        if (/^(ui-search|poly|andes-money|andes-card|nav-search)/.test(c)) freq[c] = (freq[c] || 0) + 1;
      }
    }
    const topClasses = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([c, n]) => `${c}:${n}`);
    const scripts = [...doc.querySelectorAll('script')];
    return {
      versao: meta.version || null,
      origem: meta.origin || null,
      url: url.split('#')[0].slice(0, 200),
      status: meta.status != null ? meta.status : null,
      titulo: clean(doc.title).slice(0, 120),
      tipoDePagina: kind,
      tamanhoHtml: html,
      estrategia: parsed.strategy,
      anunciosLidos: parsed.items.length,
      porEstrategia: parsed.counts,
      elementos: {
        cardsLi: count('li.ui-search-layout__item'),
        polyCard: count('.poly-card'),
        precos: count('.andes-money-amount'),
        linksDeAnuncio: [...doc.querySelectorAll('a[href]')].filter((a) => ITEM_HREF_RE.test(a.getAttribute('href'))).length,
        scripts: scripts.length,
        scriptsComPolycard: scripts.filter((s) => (s.textContent || '').includes('"polycard"')).length,
        jsonLd: count('script[type="application/ld+json"]'),
        estadoNordic: scripts.filter((s) => /__NORDIC_RENDERING_CTX__|_n\.ctx/.test(s.id + (s.textContent || '').slice(0, 200))).length,
        estadoPreloaded: count('#__PRELOADED_STATE__')
      },
      classes: topClasses
    };
  }

  /** Termo de busca exibido na página (campo de busca ou URL). */
  function queryFromDocument(doc) {
    const input = doc.querySelector('input.nav-search-input, input[name="as_word"]');
    if (input && clean(input.value)) return clean(input.value);
    try {
      const u = new URL(doc.location.href);
      if (u.searchParams.get('as_word')) return clean(u.searchParams.get('as_word'));
      if (/lista\./.test(u.hostname)) {
        const seg = u.pathname.split('/').filter(Boolean)[0] || '';
        return clean(decodeURIComponent(seg).split('_')[0].replace(/-/g, ' '));
      }
    } catch { /* ignore */ }
    return '';
  }

  const api = { parseSearchDocument, diagnoseDocument, queryFromDocument, idFromUrl, safeLink, safeImage, parseBRL, sliceJsonObject, polycardToItem };
  globalThis.RadarML = api;

  // Na aba do ML: espera os anúncios aparecerem (a página pode renderizar via JS) e devolve resultado + diagnóstico.
  globalThis.__radarExtract = async function (opts) {
    const timeout = (opts && opts.timeout) || 8000;
    const t0 = Date.now();
    let parsed = parseSearchDocument(document);
    while (!parsed.items.length && Date.now() - t0 < timeout) {
      const d = diagnoseDocument(document, { parsed });
      if (d.tipoDePagina === 'verificacao' || d.tipoDePagina === 'sem-resultados') break;
      await new Promise((r) => setTimeout(r, 500));
      parsed = parseSearchDocument(document);
    }
    return {
      items: parsed.items,
      query: queryFromDocument(document),
      diagnostic: diagnoseDocument(document, { parsed, origin: 'aba', version: opts && opts.version })
    };
  };
})();
