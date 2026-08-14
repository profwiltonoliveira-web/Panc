// ATENÇÃO — DADOS DE DEMONSTRAÇÃO — NÃO PUBLICAR
// Este arquivo existe apenas para permitir que a interface seja visualizada e
// testada durante o desenvolvimento. Nenhum nome de morador, entrevista,
// identificação botânica, etimologia, ocorrência ou dado de campo aqui é real.
// Ao conectar o projeto ao Supabase, substitua estas funções por consultas
// reais (ver src/lib/supabase/client.ts e supabase/schema.sql).

import { Plant } from "./types";

export const DEMO_PLANTS: Plant[] = [
  {
    id: "demo-1",
    slug: "bredo",
    nomeDestaque: "Bredo",
    nomeCientifico: "Amaranthus sp.",
    familia: "Amaranthaceae",
    genero: "Amaranthus",
    especie: "sp. (identificação de exemplo — a confirmar em campo)",
    caracteristicas: "Erva de folhas macias, crescimento espontâneo em quintais e beiras de estrada.",
    habitat: "Solos revolvidos, quintais, roçados em pousio.",
    ocorrencia: "Registro de demonstração — ocorrência a validar em Itamira.",
    observacoesBotanicas: "DADO DE DEMONSTRAÇÃO — NÃO PUBLICAR.",
    parteUtilizada: "Folhas e talos tenros.",
    formaPreparo: "Refogado, cozido em caldos.",
    formaConsumo: "Acompanhamento de arroz e feijão.",
    receitas: "DADO DE DEMONSTRAÇÃO — NÃO PUBLICAR.",
    observacoesUso: "Exemplo ilustrativo apenas.",
    descricaoCurta: "Erva de folhas macias, tradicionalmente usada em refogados na região.",
    status: "publicado",
    categoria: "Folhosas",
    autorId: "demo-pesquisador-1",
    demonstracao: true,
    fotos: [
      {
        id: "foto-1",
        plantId: "demo-1",
        url: "/demo-photos/placeholder-folha.svg",
        legenda: "Fotografia de demonstração",
        autoria: "Acervo de demonstração",
        data: "2025-01-01",
        localRegistro: "Itamira (exemplo)",
        principal: true
      }
    ],
    registroLinguistico: {
      id: "ling-1",
      plantId: "demo-1",
      nomePopular: "Bredo",
      variacoes: ["Bredo-de-porco (exemplo)", "Caruru (variante regional a confirmar)"],
      pronuncia: "/ˈbɾe.du/",
      significado: "DADO DE DEMONSTRAÇÃO — NÃO PUBLICAR.",
      origemNome: "DADO DE DEMONSTRAÇÃO — NÃO PUBLICAR.",
      usoLinguistico: "Exemplo de uso corrente em frases coletadas na comunidade (fictício).",
      expressoesRelacionadas: "Exemplo ilustrativo apenas.",
      observacaoLinguistica: "Análise de exemplo dos pesquisadores sobre a variação lexical observada.",
      fonteRegistro: "Registro de campo de demonstração — Itamira, 2025 (fictício)",
      etimologia: {
        naoDeterminada: true
      }
    },
    saberes: [
      {
        id: "saber-1",
        plantId: "demo-1",
        descricao: "DADO DE DEMONSTRAÇÃO — NÃO PUBLICAR. Relato ilustrativo sobre uso tradicional.",
        tipo: "uso_tradicional",
        fonteCompativel: "Fonte anonimizada de demonstração",
        registradoEm: "2025-01-01"
      }
    ],
    referencias: [
      {
        id: "ref-1",
        plantId: "demo-1",
        tipo: "catalogo",
        titulo: "Kinupp, V.F. & Lorenzi, H. — Plantas Alimentícias Não Convencionais (PANC) no Brasil (referência de exemplo)",
        ano: "2014"
      }
    ],
    localizacoes: [
      { id: "loc-1", plantId: "demo-1", latitude: -11.9439, longitude: -38.3672, tipo: "ocorrencia", descricao: "Ponto de demonstração próximo a Itamira" }
    ]
  },
  {
    id: "demo-2",
    slug: "ora-pro-nobis",
    nomeDestaque: "Ora-pro-nóbis",
    nomeCientifico: "Pereskia aculeata",
    familia: "Cactaceae",
    descricaoCurta: "Cacto trepador de folhas mucilaginosas, rico em proteína, comum em cercas vivas.",
    status: "publicado",
    categoria: "Folhosas",
    autorId: "demo-pesquisador-1",
    demonstracao: true,
    fotos: [
      {
        id: "foto-2",
        plantId: "demo-2",
        url: "/demo-photos/placeholder-folha.svg",
        legenda: "Fotografia de demonstração",
        principal: true
      }
    ],
    saberes: [],
    referencias: [],
    localizacoes: []
  },
  {
    id: "demo-3",
    slug: "maria-mole",
    nomeDestaque: "Maria-mole",
    nomeCientifico: "Talinum sp.",
    descricaoCurta: "Planta suculenta de folhas carnosas, usada em saladas e refogados.",
    status: "em_revisao",
    categoria: "Folhosas",
    autorId: "demo-pesquisador-1",
    demonstracao: true,
    fotos: [],
    saberes: [],
    referencias: [],
    localizacoes: []
  }
];

export function getPublishedDemoPlants(): Plant[] {
  return DEMO_PLANTS.filter((p) => p.status === "publicado");
}

export function getDemoPlantBySlug(slug: string): Plant | undefined {
  return DEMO_PLANTS.find((p) => p.slug === slug);
}
