// Categorias do radar e fontes de descoberta (somente páginas públicas do Mercado Livre).
//
// Fontes:
//  - Página oficial de ofertas: https://www.mercadolivre.com.br/ofertas  (paginação: &page=N)
//  - Ofertas por categoria:     https://www.mercadolivre.com.br/ofertas?category=<ID da categoria>
//  - Ofertas até R$ 100:        URL vista na página inicial real do ML (container_id=MLB779362-1)
// IDs de categoria: MLB263532 (Ferramentas) e MLB264586 (Saúde) foram vistos na página inicial
// real do ML. Os demais são os IDs públicos conhecidos das categorias do ML Brasil e são
// conferidos em tempo de execução pelo diagnóstico de cada fonte (página carregada / anúncios lidos).

export const GROUPS = [
  { id: 'eletronicos', name: 'Eletrônicos' },
  { id: 'casa', name: 'Casa e cozinha' },
  { id: 'moda', name: 'Moda' },
  { id: 'beleza', name: 'Beleza' },
  { id: 'outras', name: 'Outras categorias' }
];

export const CATEGORIES = [
  { id: 'celulares', name: 'Celulares e telefones', group: 'eletronicos', ml: 'MLB1051',
    kw: ['celular', 'smartphone', 'iphone', 'galaxy', 'redmi', 'xiaomi', 'motorola', 'moto g', 'moto e', 'poco', 'realme', 'telefone sem fio'] },
  { id: 'eletronicos', name: 'Eletrônicos, áudio e vídeo', group: 'eletronicos', ml: 'MLB1000',
    kw: ['smart tv', 'televisao', 'tv ', 'fone de ouvido', 'fone bluetooth', 'headset', 'caixa de som', 'soundbar', 'echo dot', 'alexa', 'projetor', 'camera', 'smartwatch', 'relogio inteligente', 'fire tv', 'chromecast', 'tablet', 'kindle'] },
  { id: 'informatica', name: 'Informática', group: 'eletronicos', ml: 'MLB1648',
    kw: ['notebook', 'monitor', 'mouse', 'teclado', 'ssd', 'hd externo', 'pendrive', 'pen drive', 'impressora', 'roteador', 'processador', 'placa de video', 'memoria ram', 'webcam', 'computador', 'desktop', 'cartao de memoria'] },
  { id: 'games', name: 'Games', group: 'eletronicos', ml: 'MLB1144',
    kw: ['playstation', 'ps5', 'ps4', 'xbox', 'nintendo', 'switch', 'console', 'jogo ps', 'gamepad', 'controle sem fio'] },
  { id: 'eletrodomesticos', name: 'Eletrodomésticos', group: 'casa', ml: 'MLB5726',
    kw: ['geladeira', 'refrigerador', 'fogao', 'micro-ondas', 'microondas', 'lava e seca', 'lavadora', 'maquina de lavar', 'air fryer', 'fritadeira', 'liquidificador', 'aspirador', 'ventilador', 'ar condicionado', 'ar-condicionado', 'cafeteira', 'batedeira', 'mixer', 'sanduicheira', 'ferro de passar', 'purificador', 'freezer', 'forno eletrico', 'cooktop', 'depurador', 'robo aspirador'] },
  { id: 'casa', name: 'Casa, móveis e decoração', group: 'casa', ml: 'MLB1574',
    kw: ['sofa', 'mesa', 'cadeira', 'cama ', 'colchao', 'travesseiro', 'luminaria', 'tapete', 'cortina', 'organizador', 'panela', 'frigideira', 'faqueiro', 'pote', 'garrafa termica', 'copo', 'jogo de cama', 'toalha', 'edredom', 'escrivaninha', 'estante', 'guarda-roupa', 'espelho', 'jogo de panelas', 'utensilio', 'lixeira', 'varal'] },
  { id: 'moda', name: 'Calçados, roupas e bolsas', group: 'moda', ml: 'MLB1430',
    kw: ['tenis', 'camiseta', 'camisa', 'calca', 'bermuda', 'vestido', 'jaqueta', 'moletom', 'bolsa', 'mochila', 'sandalia', 'chinelo', 'bota', 'blusa', 'cueca', 'calcinha', 'sutia', 'meia', 'bone', 'carteira', 'oculos de sol', 'jeans', 'saia', 'pijama'] },
  { id: 'beleza', name: 'Beleza e cuidado pessoal', group: 'beleza', ml: 'MLB1246',
    kw: ['perfume', 'shampoo', 'condicionador', 'creme', 'hidratante', 'maquiagem', 'batom', 'secador', 'chapinha', 'prancha', 'barbeador', 'aparador', 'protetor solar', 'serum', 'base liquida', 'rimel', 'mascara capilar', 'desodorante', 'escova rotativa', 'esmalte', 'body splash', 'kit skincare'] },
  { id: 'ferramentas', name: 'Ferramentas', group: 'outras', ml: 'MLB263532',
    kw: ['furadeira', 'parafusadeira', 'serra', 'jogo de chaves', 'chave de fenda', 'kit ferramentas', 'jogo de ferramentas', 'trena', 'esmerilhadeira', 'lixadeira', 'alicate', 'martelo', 'compressor', 'lavadora de alta pressao', 'multimetro', 'nivel a laser'] },
  { id: 'brinquedos', name: 'Brinquedos e hobbies', group: 'outras', ml: 'MLB1132',
    kw: ['boneca', 'lego', 'carrinho', 'brinquedo', 'pelucia', 'quebra-cabeca', 'quebra cabeca', 'hot wheels', 'jogo de tabuleiro', 'massinha', 'barbie', 'patinete'] },
  { id: 'esportes', name: 'Esportes e fitness', group: 'outras', ml: 'MLB1276',
    kw: ['bicicleta', 'academia', 'haltere', 'halter', 'esteira', 'bola', 'chuteira', 'whey', 'creatina', 'yoga', 'colchonete', 'corda de pular', 'kettlebell', 'barraca', 'camping', 'pre-treino', 'suplemento'] },
  { id: 'automotivo', name: 'Acessórios para veículos', group: 'outras', ml: 'MLB5672',
    kw: ['pneu', 'som automotivo', 'oleo de motor', 'oleo motor', 'capacete', 'multimidia', 'automotivo', 'para carro', 'para moto', 'retrovisor', 'farol', 'lampada led h', 'calibrador', 'aspirador automotivo', 'camera de re', 'suporte veicular'] },
  { id: 'saude', name: 'Saúde', group: 'outras', ml: 'MLB264586',
    kw: ['termometro', 'medidor de pressao', 'oximetro', 'nebulizador', 'vitamina', 'colageno', 'omega 3', 'massageador'] },
  { id: 'outros', name: 'Outros', group: 'outras', ml: null, kw: [] }
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

const norm = (s) => ' ' + String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+-]+/g, ' ').trim() + ' ';

/** Categoria pelo título (usada para itens da página geral de ofertas). */
export function categorize(title) {
  const t = norm(title);
  let best = null, bestPos = Infinity;
  for (const c of CATEGORIES) {
    for (const k of c.kw) {
      const pos = t.indexOf(' ' + k.trim() + (k.endsWith(' ') ? ' ' : ''));
      // A palavra que aparece primeiro no título costuma ser o produto ("Capa para celular" → celular aparece depois)
      if (pos >= 0 && pos < bestPos) { best = c.id; bestPos = pos; }
    }
  }
  return best || 'outros';
}

export const OFFERS_URL = 'https://www.mercadolivre.com.br/ofertas';

/**
 * Lista de páginas a consultar numa varredura.
 * @param {{ categories?: string[], pages?: number }} settings
 */
export function buildSources(settings = {}) {
  const pages = Math.max(1, Math.min(3, settings.pages || 1));
  const enabled = new Set(settings.categories && settings.categories.length ? settings.categories : CATEGORIES.map((c) => c.id));
  const list = [];
  const add = (id, name, url, category) => {
    for (let p = 1; p <= pages; p++) {
      const u = p === 1 ? url : url + (url.includes('?') ? '&' : '?') + 'page=' + p;
      list.push({ id: p === 1 ? id : `${id}-p${p}`, name: p === 1 ? name : `${name} (pág. ${p})`, url: u, category });
    }
  };
  add('ofertas', 'Ofertas do dia (todas as categorias)', OFFERS_URL, null);
  list.push({ id: 'ofertas-ate-100', name: 'Ofertas até R$ 100', url: OFFERS_URL + '?price=0.0-100.0&container_id=MLB779362-1', category: null });
  for (const c of CATEGORIES) {
    if (!c.ml || !enabled.has(c.id)) continue;
    add('cat-' + c.id, 'Ofertas: ' + c.name, `${OFFERS_URL}?category=${c.ml}`, c.id);
  }
  return list;
}
