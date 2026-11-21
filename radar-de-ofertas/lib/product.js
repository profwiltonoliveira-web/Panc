// Identificação estruturada de produto a partir do título do anúncio.
// Extrai marca, modelo, versão (variante), capacidade, RAM, tamanho, quantidade,
// condição e se é acessório. A chave resultante define ofertas EQUIVALENTES:
// mesma marca, modelo, versão, capacidade, tamanho, quantidade e condição.
// Cor e palavras de marketing são ignoradas. Na dúvida, NÃO agrupa (evita misturar produtos).

import { tokens } from './analyzer.js';

// Marcas comuns no Mercado Livre Brasil (lista aberta; marcas desconhecidas ficam sem marca).
const BRANDS = ['apple', 'samsung', 'motorola', 'xiaomi', 'redmi', 'poco', 'realme', 'lg', 'sony', 'philips', 'jbl', 'tcl', 'aoc', 'philco', 'britania', 'mondial', 'electrolux', 'brastemp', 'consul', 'arno', 'oster', 'cadence', 'wap', 'karcher', 'multilaser', 'lenovo', 'dell', 'acer', 'asus', 'hp', 'positivo', 'vaio', 'intelbras', 'logitech', 'redragon', 'hyperx', 'razer', 'kingston', 'sandisk', 'seagate', 'corsair', 'nintendo', 'microsoft', 'bosch', 'makita', 'dewalt', 'vonder', 'tramontina', 'stanley', 'nike', 'adidas', 'puma', 'olympikus', 'mizuno', 'fila', 'asics', 'vans', 'converse', 'havaianas', 'natura', 'boticario', 'loreal', 'nivea', 'wella', 'eudora', 'avon', 'lego', 'mattel', 'hasbro', 'barbie', 'amazon', 'kindle', 'blackdecker', 'tplink', 'westerndigital', 'hotwheels', 'dolcegusto', 'trescoracoes', 'gree', 'midea', 'springer', 'fischer', 'panasonic', 'jvc', 'pioneer', 'edifier', 'qcy', 'haylou', 'amazfit', 'garmin', 'lenoxx', 'gopro', 'canon', 'nikon', 'fujifilm', 'dji', 'growth', 'integralmedica', 'probiotica', 'caloi', 'oxer', 'atrio', 'tissot', 'casio', 'orient', 'technos', 'invicta', 'oakley', 'rayban', 'nespresso', 'kitchenaid', 'cuisinart', 'rinnai', 'lorenzetti', 'fiat', 'volkswagen', 'chevrolet', 'pirelli', 'michelin', 'goodyear', 'bridgestone', 'continental'];
const BRAND_SET = new Set(BRANDS);
const BRAND_ALIASES = { 'black+decker': 'blackdecker', 'black & decker': 'blackdecker', 'black decker': 'blackdecker', 'tp-link': 'tplink', 'tp link': 'tplink', "l'oreal": 'loreal', 'l oreal': 'loreal', 'o boticario': 'boticario', 'western digital': 'westerndigital', 'ray-ban': 'rayban', 'ray ban': 'rayban', 'hot wheels': 'hotwheels', 'dolce gusto': 'dolcegusto', 'tres coracoes': 'trescoracoes' };

// Famílias/linhas que fazem parte do modelo ("galaxy s25", "redmi note 13", "moto g54").
const FAMILY = new Set(['iphone', 'ipad', 'macbook', 'airpods', 'watch', 'galaxy', 'note', 'redmi', 'poco', 'moto', 'edge', 'razr', 'ideapad', 'thinkpad', 'inspiron', 'vostro', 'aspire', 'nitro', 'vivobook', 'zenbook', 'rog', 'tuf', 'pavilion', 'victus', 'omen', 'playstation', 'ps5', 'ps4', 'xbox', 'switch', 'kindle', 'echo', 'dot', 'tune', 'flip', 'charge', 'go', 'boombox', 'partybox', 'wave', 'live', 'endurance', 'revolution', 'air', 'jordan', 'ultraboost', 'superstar', 'crystal', 'qled', 'oled', 'neo', 'bravia']);
// Versões que mudam o produto.
const VARIANT = new Set(['pro', 'max', 'plus', 'mini', 'ultra', 'lite', 'fe', 'slim', 'xl', 'xr', 'xs', 'promax', 'edge', 'se', 'prime', 'turbo', 'power', 'play', 'stylus', 'fold', 'flip']);
// Palavras que não identificam o produto (cores, marketing, logística).
const NOISE = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'sem', 'para', 'pra', 'o', 'a', 'os', 'as', 'em', 'no', 'na', 'por', 'novo', 'nova', 'novos', 'original', 'originais', 'lacrado', 'lacrada', 'oferta', 'promocao', 'envio', 'imediato', 'frete', 'gratis', 'garantia', 'nf', 'nota', 'fiscal', 'pronta', 'entrega', 'cor', 'cores', 'preto', 'preta', 'branco', 'branca', 'azul', 'vermelho', 'vermelha', 'verde', 'rosa', 'cinza', 'prata', 'dourado', 'dourada', 'grafite', 'roxo', 'roxa', 'lilas', 'amarelo', 'amarela', 'bege', 'marrom', 'titanio', 'natural', 'meia', 'noite', 'estelar', 'navy', 'unidade', 'unidades', 'un', 'und', 'pc', 'pcs', 'peca', 'pecas', 'versao', 'global', 'nacional', 'importado', 'brasil', 'bivolt', '110v', '127v', '220v', '5g', '4g', 'lte', 'dual', 'chip', 'sim', 'smartphone', 'celular', 'tela', 'camera', 'bateria', 'mah', 'ram', 'memoria', 'interna', 'armazenamento', 'android', 'ios']);

// Acessórios/peças: valem quando aparecem no início do título ou antes de "para"/"compatível".
const ACCESSORY_LEAD = new Set(['capa', 'capinha', 'case', 'pelicula', 'suporte', 'carregador', 'cabo', 'adaptador', 'protetor', 'estojo', 'refil', 'peca', 'pecas', 'tela', 'display', 'bateria', 'almofada', 'almofadas', 'ponteira', 'ponteiras', 'skin', 'adesivo', 'controle', 'pulseira', 'carcaca', 'tampa', 'botao', 'flex', 'conector', 'lente', 'vidro', 'kit']);

const SIZE_UNITS = { pol: 'pol', polegadas: 'pol', polegada: 'pol', ml: 'ml', l: 'l', litro: 'l', litros: 'l', kg: 'kg', g: 'g', w: 'w', cm: 'cm', mm: 'mm', m: 'm', btus: 'btu', btu: 'btu', v: null };

function normTitle(title) {
  let t = String(title || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const [a, b] of Object.entries(BRAND_ALIASES)) t = t.split(a).join(b);
  return t.replace(/(\d)[.,](\d{1,2})(?=\s*(l|litros?|kg|g|ml|pol|polegadas?|"|m|cm|mm)\b)/g, '$1p$2') // 1,5l → 1p5l (decimal preservado na tokenização)
    .replace(/(\d)\s*"/g, '$1pol')         // 50" → 50pol
    .replace(/(\d(?:p\d{1,2})?)\s+(litros?|l|kg|g|ml|cm|mm|w|btus?|gb|tb)\b/g, '$1$2') // "1p2 litros" → "1p2litros"
    .replace(/(\d)\s*(polegadas?|pol)\b/g, '$1pol');
}

/** Capacidade em GB a partir de um token "128gb"/"1tb". */
const capGB = (t) => { const m = t.match(/^(\d+)(gb|tb)$/); return m ? Number(m[1]) * (m[2] === 'tb' ? 1024 : 1) : null; };

/**
 * @returns {{ brand, model, variant, capacity, ram, size, qty, condition, accessory, key, confident }}
 */
export function parseProduct(title, condition = null) {
  const tt = tokens(normTitle(title));
  const accessory = isAccessory(tt);

  // Quantidade: "kit 2", "2 unidades", "c/ 3", "pack 6", "2x"
  let qty = 1;
  const joined = tt.join(' ');
  const q = joined.match(/\b(?:kit|pack|combo|c|com)\s+(\d{1,2})\b/) || joined.match(/\b(\d{1,2})\s*(?:unidades|unidade|un|und|pecas|pares|x)\b/);
  if (q && Number(q[1]) > 1 && Number(q[1]) <= 50) qty = Number(q[1]);

  // Capacidade (armazenamento) e RAM
  const caps = [];
  tt.forEach((t, i) => { const gb = capGB(t); if (gb != null) caps.push({ i, gb }); });
  const ramIdx = new Set();
  for (const { i } of caps) {
    if ([tt[i + 1], tt[i - 1], tt[i + 1] === 'de' ? tt[i + 2] : null].includes('ram')) ramIdx.add(i);
  }
  if (caps.some((c) => c.gb >= 64)) for (const c of caps) if (c.gb <= 32) ramIdx.add(c.i);
  const storage = caps.filter((c) => !ramIdx.has(c.i)).map((c) => c.gb);
  const ram = caps.filter((c) => ramIdx.has(c.i)).map((c) => c.gb);
  const capacity = storage.length ? Math.max(...storage) : null;

  // Tamanho/medida (polegadas, litros, ml, kg, W, BTUs…) — o primeiro de cada unidade
  const size = {};
  for (const t of tt) {
    if (NOISE.has(t)) continue; // "5g"/"4g" = rede móvel, não 5 gramas
    const m = t.match(/^(\d+)(?:p(\d{1,2}))?(pol|polegadas|polegada|ml|l|litros?|kg|g|w|cm|mm|btus?)$/);
    if (m) {
      const u = SIZE_UNITS[m[3]] || m[3];
      const v = Number(m[1] + (m[2] ? '.' + m[2] : ''));
      if (u === 'g' && v < 10) continue; // "3g"/"5g" quase sempre é rede, não peso
      if (u && size[u] == null) size[u] = v;
    }
  }
  // "Smart TV 50" sem unidade: número entre 19 e 100 após "tv"
  const tvIdx = tt.indexOf('tv');
  if (tvIdx >= 0 && size.pol == null) {
    const n = tt.slice(tvIdx + 1, tvIdx + 4).find((t) => /^\d{2,3}$/.test(t) && Number(t) >= 19 && Number(t) <= 100);
    if (n) size.pol = Number(n);
  }

  // Marca: primeira marca conhecida no título
  const brand = tt.find((t) => BRAND_SET.has(t)) || null;

  // Modelo: tokens alfanuméricos com dígito (s25, a15, 520bt, g54) e famílias, exceto medidas/capacidades/quantidades
  const isMeasure = (t) => capGB(t) != null || /^\d+(p\d{1,2})?(pol|ml|l|litros?|kg|g|w|cm|mm|btus?|v|mah|mp|hz|gb|tb|k)$/.test(t);
  const model = [];
  const variant = [];
  tt.forEach((t, i) => {
    if (NOISE.has(t) || t === brand || isMeasure(t)) return;
    if (VARIANT.has(t) && i > 0) { variant.push(t); return; }
    if (FAMILY.has(t)) { model.push(t); return; }
    if (/[a-z]/.test(t) && /\d/.test(t)) { model.push(t); return; }
    // número puro logo após uma família/modelo ("iphone 15", "note 13", "tune 520")
    if (/^\d{1,4}$/.test(t) && i > 0 && (FAMILY.has(tt[i - 1]) || /[a-z]\d|^\d+$/.test(tt[i - 1] || '') && model.length) && Number(t) !== qty) model.push(t);
  });
  if (condition === 'usado' || condition === 'recondicionado' || /\b(usado|seminovo|recondicionado|vitrine)\b/.test(joined)) condition = condition || 'usado';

  const hasModel = model.some((t) => /\d/.test(t));
  const confident = !!(brand && hasModel);
  const parts = [
    brand || '?',
    [...new Set(model)].join(' '),
    [...new Set(variant)].sort().join(' '),
    capacity ? capacity + 'gb' : '',
    Object.entries(size).sort().map(([u, v]) => v + u).join(' '),
    qty > 1 ? 'x' + qty : '',
    condition === 'usado' || condition === 'recondicionado' ? 'usado' : 'novo',
    accessory ? 'acessorio' : ''
  ];
  return { brand, model: [...new Set(model)], variant: [...new Set(variant)].sort(), capacity, ram: ram.length ? Math.max(...ram) : null, size, qty, condition: condition || null, accessory, key: parts.join('|'), confident };
}

function isAccessory(tt) {
  const sig = tt.filter((t) => !NOISE.has(t) || t === 'para');
  if (!sig.length) return false;
  if (ACCESSORY_LEAD.has(sig[0]) && sig[0] !== 'kit') return true;
  if (sig[0] === 'kit' && sig.slice(1, 4).some((t) => ACCESSORY_LEAD.has(t) && t !== 'kit')) return true; // "Kit película + capa"
  if (sig.slice(0, 8).includes('compativel')) return true;
  const para = sig.indexOf('para');
  return para > 0 && para <= 3 && sig.slice(0, para).some((t) => ACCESSORY_LEAD.has(t) && t !== 'kit');
}

/** Atalho usado pela pontuação e pelo painel. */
export function isAccessoryTitle(title) {
  return parseProduct(title).accessory;
}

/**
 * Agrupa ofertas equivalentes.
 *  - Com marca + modelo identificados ("confiante"): chave estrutural exata.
 *  - Sem modelo claro: só agrupa títulos muito parecidos (Jaccard ≥ 0,8) com MESMA marca,
 *    capacidade, tamanho, quantidade, condição e tipo (acessório/produto).
 * @returns Map id -> chave do grupo
 */
export function groupEquivalents(offers) {
  const out = new Map();
  const loose = []; // { key, sig, tokens }
  for (const o of offers) {
    const p = o.product || parseProduct(o.title, o.condition);
    if (p.confident) { out.set(o.id, 'k:' + p.key); continue; }
    const sig = [p.brand || '?', p.capacity || '', JSON.stringify(p.size), p.qty, p.condition === 'usado' ? 'u' : 'n', p.accessory ? 'a' : 'p', o.category || ''].join('|');
    const tk = new Set(tokens(normTitle(o.title)).filter((t) => !NOISE.has(t) && t.length > 1));
    let best = null, bestSim = 0.8;
    for (const g of loose) {
      if (g.sig !== sig) continue;
      let inter = 0;
      for (const x of tk) if (g.tokens.has(x)) inter++;
      const sim = inter / (tk.size + g.tokens.size - inter || 1);
      if (sim >= bestSim) { best = g; bestSim = sim; }
    }
    if (!best) { best = { key: 'j:' + loose.length + ':' + sig, sig, tokens: tk }; loose.push(best); }
    out.set(o.id, best.key);
  }
  return out;
}
