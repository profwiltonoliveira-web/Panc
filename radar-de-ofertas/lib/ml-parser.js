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
  const CARD_SEL = 'li.ui-search-layout__item, div.poly-card, div.ui-search-result__wrapper, div.andes-card.poly-card, li.promotion-item, div.promotion-item';
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
    let originalPriceFrom = originalPrice ? 'anuncio' : null;
    // Sem preço "de" mas com o selo "X% OFF" exibido pelo ML: o "de" é o que o próprio ML mostra
    // (preço / (1 − X%)), marcado como derivado do selo — não é um valor inventado pelo Radar.
    if (!originalPrice && o.discountLabelPct > 0 && o.discountLabelPct < 95) {
      originalPrice = Math.round((o.price / (1 - o.discountLabelPct / 100)) * 100) / 100;
      originalPriceFrom = 'selo-off';
    }
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
      seller: o.seller ? clean(o.seller).replace(/^(por|vendido por)\s+/i, '') : null,
      officialStore: !!o.officialStore || /loja oficial|official store/i.test(String(o.seller || '')),
      badges: (o.badges || []).map(clean).filter(Boolean).slice(0, 4),
      rating: o.rating > 0 && o.rating <= 5 ? Math.round(o.rating * 10) / 10 : null,
      reviews: o.reviews > 0 ? Math.round(o.reviews) : null,
      installments: null,
      originalPriceFrom,
      parsedBy: o.parsedBy || null
    };
  }

  /** "35% OFF" → 35 (selo de desconto exibido pelo ML) */
  function offPct(text) {
    const m = String(text || '').match(/(\d{1,2})\s*%\s*off/i);
    return m ? Number(m[1]) : null;
  }

  // Selos relevantes para promoções (texto curto exibido pelo próprio ML no card).
  const BADGE_RE = /oferta do dia|oferta rel[aâ]mpago|rel[aâ]mpago|mais vendido|oferta imperd[ií]vel|menor pre[cç]o|recomendado|full\b/i;
  function badgesFromText(text) {
    const out = [];
    const t = String(text || '');
    for (const m of t.matchAll(new RegExp(BADGE_RE.source, 'gi'))) {
      const b = m[0].toUpperCase();
      if (!out.includes(b)) out.push(b);
    }
    return out;
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
    const prevSrc = priceC.previous_price || priceC.original_price || priceC.prev_price || priceC.regular_price || priceC.list_price || null;
    const prev = prevSrc ? (typeof prevSrc === 'number' ? { value: prevSrc } : findDeep(prevSrc, (o) => typeof o.value === 'number' || typeof o.amount === 'number')) : null;
    const discountLabelPct = offPct(textOf(priceC.discount_label) || textOf(priceC.discount) || textOf(comp('discount')));
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
    const sellerC = comp('seller');
    const seller = textOf(sellerC);
    const extra = textOf(comp('highlight')) + ' ' + textOf(comp('item_condition')) + ' ' + textOf(comp('condition'));
    const reviews = comp('reviews') || {};
    const official = !!(md.official_store_id || (sellerC && (sellerC.official_store || sellerC.official_store_id))) || /loja oficial/i.test(seller);
    return makeItem({
      title,
      link,
      price: cur ? cur.value : null,
      originalPrice: prev ? (typeof prev.value === 'number' ? prev.value : prev.amount) : null,
      discountLabelPct,
      parsedBy: 'json',
      ...shippingFromText(shipText),
      condition: conditionFromText(extra),
      image,
      seller,
      officialStore: official,
      badges: badgesFromText(textOf(comp('highlight')) + ' ' + textOf(comp('promotions')) + ' ' + textOf(comp('pds'))),
      rating: typeof reviews.rating_average === 'number' ? reviews.rating_average : null,
      reviews: typeof reviews.total === 'number' ? reviews.total : null
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

  // ---------- A2) Estado da página (Nordic / __PRELOADED_STATE__) em formato genérico ----------
  // Alguns layouts trazem os resultados no estado da página sem a chave "polycard".
  // Aceita só objetos com ID de anúncio (MLB…), título, preço numérico e link do ML.
  function priceFrom(o) {
    if (typeof o.price === 'number') return o.price;
    if (o.price && typeof o.price === 'object') {
      for (const k of ['amount', 'value', 'current']) if (typeof o.price[k] === 'number') return o.price[k];
      if (o.price.current_price && typeof o.price.current_price.value === 'number') return o.price.current_price.value;
    }
    if (o.prices && Array.isArray(o.prices.prices)) { const p = o.prices.prices.find((x) => x && typeof x.amount === 'number'); if (p) return p.amount; }
    return null;
  }
  function parseFromState(doc) {
    const out = [];
    let blocks = 0;
    for (const s of doc.querySelectorAll('script')) {
      const text = s.textContent || '';
      const isState = s.id === '__NORDIC_RENDERING_CTX__' || s.id === '__PRELOADED_STATE__' || /^\s*_n\.ctx/.test(text) || (s.type === 'application/json' && text.includes('MLB'));
      if (!isState || !/MLB\d{6,}/.test(text) || text.includes('"polycard"')) continue;
      const start = text.indexOf('{');
      const raw = start >= 0 ? sliceJsonObject(text, start) : null;
      if (!raw) continue;
      let data;
      try { data = JSON.parse(raw); } catch { continue; }
      blocks++;
      let visited = 0;
      (function walk(o, depth) {
        if (!o || typeof o !== 'object' || depth > 14 || ++visited > 200000) return;
        if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return; }
        if (typeof o.id === 'string' && /^MLB\d{6,}$/.test(o.id) && typeof o.title === 'string') {
          const link = o.permalink || o.url || o.link;
          const price = priceFrom(o);
          if (link && price) {
            const item = makeItem({
              title: o.title, link: /^https?:/.test(link) ? link : 'https://' + String(link).replace(/^\/+/, ''),
              price, originalPrice: typeof o.original_price === 'number' ? o.original_price : (o.price && typeof o.price.original_price === 'number' ? o.price.original_price : null),
              ...(o.shipping && o.shipping.free_shipping ? { shipping: 0, freeShipping: true } : {}),
              condition: o.condition === 'used' ? 'usado' : null,
              discountLabelPct: o.discount && typeof o.discount.rate === 'number' ? Math.round(o.discount.rate * (o.discount.rate <= 1 ? 100 : 1)) : null,
              parsedBy: 'estado',
              image: o.thumbnail || (o.pictures && o.pictures[0] && o.pictures[0].url) || ''
            });
            if (item) { out.push(item); return; }
          }
        }
        for (const k in o) walk(o[k], depth + 1);
      })(data, 0);
    }
    return { items: out, blocks };
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
    const a = pick(card, ['a.poly-component__title', 'h3 a[href]', 'h2 a[href]', 'a.ui-search-item__group__element', 'a.ui-search-link', 'a.promotion-item__link-container']);
    const titleEl = pick(card, ['.poly-component__title', '.ui-search-item__title', '.promotion-item__title', 'h3', 'h2']);
    const currentBox = pick(card, ['.poly-price__current', '.ui-search-price__second-line', '.ui-search-price--size-medium', '.andes-money-amount-combo__main-container']);
    const prevEl = pick(card, ['s.andes-money-amount', '.andes-money-amount--previous', '.ui-search-price__original-value', '[aria-label^="Antes"]', 's']);
    const offEl = pick(card, ['.andes-money-amount__discount', '.poly-price__disc_label', '.ui-search-price__discount', '.poly-price__discount']);
    const img = pick(card, ['img.poly-component__picture', 'img']);
    const sellerEl = pick(card, ['.poly-component__seller', '.ui-search-official-store-label', '.promotion-item__seller']);
    const highlight = pick(card, ['.poly-component__highlight', '.ui-search-item__highlight-label', '.promotion-item__today-offer-text', '.promotion-item__lightning']);
    const ratingEl = pick(card, ['.poly-reviews__rating', '.ui-search-reviews__rating-number']);
    const reviewsEl = pick(card, ['.poly-reviews__total', '.ui-search-reviews__amount']);
    const text = clean(card.textContent);
    return makeItem({
      officialStore: /loja oficial/i.test(sellerEl ? sellerEl.textContent : '') || !!card.querySelector('.poly-component__seller svg, .ui-search-official-store-label'),
      badges: badgesFromText(highlight ? highlight.textContent : ''),
      rating: ratingEl ? Number(clean(ratingEl.textContent).replace(',', '.')) : null,
      reviews: reviewsEl ? Number(clean(reviewsEl.textContent).replace(/\D/g, '')) : null,
      title: (titleEl && titleEl.textContent) || (a && a.textContent),
      link: a && a.getAttribute('href'),
      price: readMoney(firstCurrentAmount(currentBox || card)),
      originalPrice: prevEl ? readMoney(prevEl) : null,
      discountLabelPct: offPct(offEl ? offEl.textContent : text),
      parsedBy: 'dom',
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
        discountLabelPct: offPct(text),
        parsedBy: 'links',
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
    const state = json.items.length ? { items: [], blocks: 0 } : parseFromState(doc);
    const dom = parseFromCards(doc);
    const links = parseFromLinks(doc);
    let items = [], strategy = null;
    if (json.items.length) { items = json.items; strategy = 'json'; }
    else if (state.items.length) { items = state.items; strategy = 'estado'; }
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
      counts: { json: json.items.length, estado: state.items.length, dom: dom.length, links: links.length, scriptsWithPolycard: json.scriptsWithPolycard, jsonParseErrors: json.parseErrors, blocosDeEstado: state.blocks }
    };
  }

  // ---------- Estado da página ----------
  // Indicadores de carregamento do ML (tela de carregamento da busca, spinners).
  const LOADING_SEL = '.ui-search-loading-screen, [class*="loading-screen"], .andes-spinner, .ui-search-loading, [aria-busy="true"]';

  /** Elemento visível? Em documento sem layout (DOMParser), a presença basta. */
  function isShown(el) {
    const win = el.ownerDocument && el.ownerDocument.defaultView;
    if (!win || !win.getComputedStyle) return true;
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  }

  function loadingIndicators(doc) {
    let n = 0;
    try { for (const el of doc.querySelectorAll(LOADING_SEL)) if (isShown(el)) n++; } catch { /* ignore */ }
    return n;
  }

  /**
   * Classifica a página. Estados: 'resultados', 'carregando', 'sem-resultados', 'verificacao',
   * 'bloqueio', 'login', 'pagina-de-produto', 'desconhecida'.
   */
  function classifyPage(doc, parsed, url) {
    const bodyText = clean(doc.body ? doc.body.textContent : '').toLowerCase();
    const count = (s) => { try { return doc.querySelectorAll(s).length; } catch { return -1; } };
    if (/account-verification|\/gz\/|captcha/i.test(url) || /captcha|verifica[cç][aã]o de seguran|confirme que voc[eê] n[aã]o [eé] um rob/.test(bodyText) || count('iframe[src*="captcha"], .g-recaptcha, #captcha') > 0) return 'verificacao';
    if (/hubo un error accediendo|houve um erro ao acessar|access denied|acesso negado/.test(bodyText) && count('a[href]') < 15) return 'bloqueio';
    if (parsed.items.length) return 'resultados';
    if (/não há anúncios|nao ha anuncios|nenhum resultado|verifique se a palavra|não encontramos/.test(bodyText) || count('.ui-search-rescue, .ui-search-rescue__info') > 0) return 'sem-resultados';
    if (/\/p\/MLB\d|\/MLB-\d/i.test(url) && !/lista\./.test(url)) return 'pagina-de-produto';
    if (/login|registration|\/jms\/.*\/lgz/i.test(url)) return 'login';
    if (loadingIndicators(doc) > 0) return 'carregando';
    return 'desconhecida';
  }

  /**
   * Diagnóstico estrutural da página (sem conteúdo pessoal: só URL, título, contagens e classes).
   */
  function diagnoseDocument(doc, meta) {
    meta = meta || {};
    const url = meta.finalUrl || (doc.location && doc.location.href) || '';
    const html = meta.htmlLength != null ? meta.htmlLength : (doc.documentElement ? doc.documentElement.outerHTML.length : 0);
    const count = (s) => { try { return doc.querySelectorAll(s).length; } catch { return -1; } };
    const parsed = meta.parsed || parseSearchDocument(doc);
    const kind = classifyPage(doc, parsed, url);
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
        estadoPreloaded: count('#__PRELOADED_STATE__'),
        telaDeCarregamento: loadingIndicators(doc)
      },
      classes: topClasses,
      ...(meta.espera ? { espera: meta.espera } : {})
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

  const api = { parseSearchDocument, diagnoseDocument, classifyPage, loadingIndicators, queryFromDocument, idFromUrl, safeLink, safeImage, parseBRL, sliceJsonObject, polycardToItem };
  globalThis.RadarML = api;

  // ---------- Espera inteligente na aba do ML ----------
  // A página de busca do ML mostra uma tela de carregamento e só depois monta os anúncios
  // via JavaScript. Em vez de esperar um tempo fixo, o leitor:
  //   - observa mudanças no DOM (MutationObserver) e reavalia logo após cada lote de mudanças;
  //   - verifica periodicamente (1 s), para o caso de a página mudar sem mutações observáveis;
  //   - termina assim que houver anúncios ou um estado final (sem resultados, verificação,
  //     bloqueio, login, página de produto);
  //   - "layout desconhecido" só depois que a página parar de carregar (sem indicador de
  //     carregamento e sem mutações por SETTLE_MS);
  //   - limite máximo: 30 s (estado final "carregando" se ainda estiver carregando).
  // Também mede quadros de animação e visibilidade: em aba/janela em segundo plano o Chrome
  // pausa requestAnimationFrame, o que pode impedir a página de montar os anúncios.
  const MAX_WAIT_MS = 30000;
  const SETTLE_MS = 5000;
  const FINAL = new Set(['resultados', 'sem-resultados', 'verificacao', 'bloqueio', 'login', 'pagina-de-produto']);

  globalThis.__radarExtract = function (opts) {
    opts = opts || {};
    const maxWait = Math.min(opts.timeout || MAX_WAIT_MS, MAX_WAIT_MS);
    const settle = opts.settleMs || SETTLE_MS;
    const t0 = Date.now();
    let lastMutation = t0, mutations = 0, checks = 0, frames = 0, done = false;
    let firstLoadingAt = null, loadingSeenMs = 0, lastCheckAt = t0;
    const visibilityAtStart = document.visibilityState;

    return new Promise((resolve) => {
      let debounce = null;
      const obs = new MutationObserver((list) => {
        mutations += list.length;
        lastMutation = Date.now();
        clearTimeout(debounce);
        debounce = setTimeout(check, 250);
      });
      try { obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-busy'] }); } catch { /* ignore */ }
      const tick = setInterval(check, 1000);
      const raf = () => { frames++; if (!done) requestAnimationFrame(raf); };
      try { requestAnimationFrame(raf); } catch { /* ignore */ }

      function finish(parsed, kind) {
        if (done) return;
        done = true;
        clearInterval(tick); clearTimeout(debounce); obs.disconnect();
        const now = Date.now();
        const espera = {
          ms: now - t0, verificacoes: checks, mutacoes: mutations, quadrosDeAnimacao: frames,
          visibilidadeInicial: visibilityAtStart, visibilidadeFinal: document.visibilityState,
          readyState: document.readyState, telaDeCarregamentoVistaMs: loadingSeenMs,
          estadoFinal: kind, limiteMs: maxWait
        };
        const diagnostic = diagnoseDocument(document, { parsed, origin: 'aba', version: opts.version, espera });
        diagnostic.tipoDePagina = kind; // estado observado ao fim da espera
        resolve({ items: parsed.items, query: queryFromDocument(document), diagnostic });
      }

      function check() {
        if (done) return;
        checks++;
        const now = Date.now();
        const parsed = parseSearchDocument(document);
        const kind = classifyPage(document, parsed, location.href);
        if (kind === 'carregando') { if (firstLoadingAt == null) firstLoadingAt = now; loadingSeenMs += now - lastCheckAt; }
        lastCheckAt = now;
        if (FINAL.has(kind)) return finish(parsed, kind);
        if (now - t0 >= maxWait) return finish(parsed, kind); // 'carregando' ou 'desconhecida' no limite
        // Página parou (sem indicador de carregamento, documento completo, DOM quieto): layout desconhecido.
        if (kind === 'desconhecida' && document.readyState === 'complete' && now - lastMutation >= settle && now - t0 >= settle) return finish(parsed, kind);
      }
      check();
    });
  };
})();
