// Converte as linhas em snake_case retornadas pelo Postgres/Supabase para os
// tipos em camelCase usados pela interface (src/lib/types.ts). Mantém as
// páginas e componentes livres de conhecimento sobre o formato de coluna do
// banco — só este arquivo conhece os dois formatos.

import {
  Foto,
  Localizacao,
  Plant,
  ReferenciaBibliografica,
  RegistroCampo,
  RegistroLinguistico,
  RevisaoEditorial,
  SaberComunitario,
  StatusVerbete
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Seleções reutilizáveis (evita repetir a mesma string de join em cada página)
// ---------------------------------------------------------------------------

// Usada na área pública: não inclui field_records nem revisions, que nunca
// são exibidos fora das áreas do pesquisador/administrador (e a policy de
// RLS dessas tabelas já bloquearia a leitura pública mesmo que fossem pedidas).
export const PLANT_PUBLIC_SELECT = `
  *,
  categories ( nome ),
  plant_photos ( * ),
  linguistic_records ( * ),
  community_knowledge ( * ),
  references ( * ),
  locations ( * )
`;

// Usada nas áreas do pesquisador e do administrador: inclui também registros
// de campo (uso interno) e o histórico de revisão editorial.
export const PLANT_FULL_SELECT = `
  *,
  categories ( nome ),
  plant_photos ( * ),
  linguistic_records ( * ),
  community_knowledge ( * ),
  references ( * ),
  locations ( * ),
  field_records ( * ),
  revisions ( *, profiles ( nome ) )
`;

// ---------------------------------------------------------------------------
// Formatos de linha vindos do Postgres (snake_case)
// ---------------------------------------------------------------------------

export interface PhotoRow {
  id: string;
  plant_id: string;
  url: string;
  legenda: string | null;
  autoria: string | null;
  data: string | null;
  local_registro: string | null;
  principal: boolean;
}

export interface LinguisticRow {
  id: string;
  plant_id: string;
  nome_popular: string;
  variacoes: string[] | null;
  pronuncia: string | null;
  significado: string | null;
  origem_nome: string | null;
  uso_linguistico: string | null;
  expressoes_relacionadas: string | null;
  observacao_linguistica: string | null;
  fonte_registro: string;
  etimologia_origem: string | null;
  etimologia_lingua_origem: string | null;
  etimologia_significado: string | null;
  etimologia_fonte: string | null;
  etimologia_observacoes: string | null;
  etimologia_nao_determinada: boolean;
}

export interface KnowledgeRow {
  id: string;
  plant_id: string;
  descricao: string;
  tipo: SaberComunitario["tipo"];
  fonte_compativel: string;
  registrado_em: string;
}

export interface ReferenceRow {
  id: string;
  plant_id: string;
  tipo: ReferenciaBibliografica["tipo"];
  titulo: string;
  autor: string | null;
  ano: string | null;
  fonte: string | null;
  url: string | null;
}

export interface LocationRow {
  id: string;
  plant_id: string | null;
  latitude: number;
  longitude: number;
  tipo: Localizacao["tipo"];
  descricao: string | null;
}

export interface FieldRecordRow {
  id: string;
  plant_id: string | null;
  pesquisador_id: string;
  descricao: string;
  data: string;
}

export interface RevisionRow {
  id: string;
  plant_id: string;
  revisor_id: string;
  status_anterior: StatusVerbete;
  status_novo: StatusVerbete;
  comentario: string | null;
  criado_em: string;
  profiles?: { nome: string } | null;
}

export interface PlantRow {
  id: string;
  slug: string;
  nome_destaque: string;
  nome_cientifico: string | null;
  familia: string | null;
  genero: string | null;
  especie: string | null;
  caracteristicas: string | null;
  habitat: string | null;
  ocorrencia: string | null;
  observacoes_botanicas: string | null;
  parte_utilizada: string | null;
  forma_preparo: string | null;
  forma_consumo: string | null;
  receitas: string | null;
  observacoes_uso: string | null;
  descricao_curta: string;
  status: StatusVerbete;
  categoria_id: string | null;
  autor_id: string;
  demonstracao: boolean;
  criado_em: string;
  atualizado_em: string;
  categories?: { nome: string } | null;
  plant_photos?: PhotoRow[] | null;
  linguistic_records?: LinguisticRow[] | null;
  community_knowledge?: KnowledgeRow[] | null;
  references?: ReferenceRow[] | null;
  locations?: LocationRow[] | null;
  field_records?: FieldRecordRow[] | null;
  revisions?: RevisionRow[] | null;
}

export interface ProfileRow {
  id: string;
  nome: string;
  papel: "administrador" | "pesquisador" | "visitante";
  instituicao: string | null;
  criado_em: string;
}

// ---------------------------------------------------------------------------
// Mapeadores
// ---------------------------------------------------------------------------

export function mapFoto(row: PhotoRow): Foto {
  return {
    id: row.id,
    plantId: row.plant_id,
    url: row.url,
    legenda: row.legenda ?? undefined,
    autoria: row.autoria ?? undefined,
    data: row.data ?? undefined,
    localRegistro: row.local_registro ?? undefined,
    principal: row.principal
  };
}

export function mapRegistroLinguistico(row: LinguisticRow): RegistroLinguistico {
  const temEtimologia =
    !row.etimologia_nao_determinada &&
    (row.etimologia_origem || row.etimologia_lingua_origem || row.etimologia_significado || row.etimologia_fonte || row.etimologia_observacoes);

  return {
    id: row.id,
    plantId: row.plant_id,
    nomePopular: row.nome_popular,
    variacoes: row.variacoes ?? [],
    pronuncia: row.pronuncia ?? undefined,
    significado: row.significado ?? undefined,
    origemNome: row.origem_nome ?? undefined,
    usoLinguistico: row.uso_linguistico ?? undefined,
    expressoesRelacionadas: row.expressoes_relacionadas ?? undefined,
    observacaoLinguistica: row.observacao_linguistica ?? undefined,
    fonteRegistro: row.fonte_registro,
    etimologia: temEtimologia || row.etimologia_nao_determinada
      ? {
          origem: row.etimologia_origem ?? undefined,
          linguaOrigem: row.etimologia_lingua_origem ?? undefined,
          significado: row.etimologia_significado ?? undefined,
          fonte: row.etimologia_fonte ?? undefined,
          observacoes: row.etimologia_observacoes ?? undefined,
          naoDeterminada: row.etimologia_nao_determinada
        }
      : undefined
  };
}

export function mapSaber(row: KnowledgeRow): SaberComunitario {
  return {
    id: row.id,
    plantId: row.plant_id,
    descricao: row.descricao,
    tipo: row.tipo,
    fonteCompativel: row.fonte_compativel,
    registradoEm: row.registrado_em
  };
}

export function mapReferencia(row: ReferenceRow): ReferenciaBibliografica {
  return {
    id: row.id,
    plantId: row.plant_id,
    tipo: row.tipo,
    titulo: row.titulo,
    autor: row.autor ?? undefined,
    ano: row.ano ?? undefined,
    fonte: row.fonte ?? undefined,
    url: row.url ?? undefined
  };
}

export function mapLocalizacao(row: LocationRow): Localizacao {
  return {
    id: row.id,
    plantId: row.plant_id ?? undefined,
    latitude: row.latitude,
    longitude: row.longitude,
    tipo: row.tipo,
    descricao: row.descricao ?? undefined
  };
}

export function mapRegistroCampo(row: FieldRecordRow): RegistroCampo {
  return {
    id: row.id,
    plantId: row.plant_id ?? undefined,
    pesquisadorId: row.pesquisador_id,
    descricao: row.descricao,
    data: row.data
  };
}

export function mapRevisao(row: RevisionRow): RevisaoEditorial {
  return {
    id: row.id,
    plantId: row.plant_id,
    revisorId: row.revisor_id,
    revisorNome: row.profiles?.nome ?? undefined,
    statusAnterior: row.status_anterior,
    statusNovo: row.status_novo,
    comentario: row.comentario ?? undefined,
    criadoEm: row.criado_em
  };
}

export function mapPlantRow(row: PlantRow): Plant {
  const fotos = (row.plant_photos ?? []).map(mapFoto);
  const linguisticos = (row.linguistic_records ?? []).map(mapRegistroLinguistico);

  return {
    id: row.id,
    slug: row.slug,
    nomeDestaque: row.nome_destaque,
    nomeCientifico: row.nome_cientifico ?? undefined,
    familia: row.familia ?? undefined,
    genero: row.genero ?? undefined,
    especie: row.especie ?? undefined,
    caracteristicas: row.caracteristicas ?? undefined,
    habitat: row.habitat ?? undefined,
    ocorrencia: row.ocorrencia ?? undefined,
    observacoesBotanicas: row.observacoes_botanicas ?? undefined,
    parteUtilizada: row.parte_utilizada ?? undefined,
    formaPreparo: row.forma_preparo ?? undefined,
    formaConsumo: row.forma_consumo ?? undefined,
    receitas: row.receitas ?? undefined,
    observacoesUso: row.observacoes_uso ?? undefined,
    descricaoCurta: row.descricao_curta,
    status: row.status,
    categoria: row.categories?.nome ?? undefined,
    autorId: row.autor_id,
    demonstracao: row.demonstracao,
    fotos,
    registroLinguistico: linguisticos[0],
    saberes: (row.community_knowledge ?? []).map(mapSaber),
    referencias: (row.references ?? []).map(mapReferencia),
    localizacoes: (row.locations ?? []).map(mapLocalizacao),
    registrosCampo: (row.field_records ?? []).map(mapRegistroCampo),
    revisoes: (row.revisions ?? [])
      .map(mapRevisao)
      .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
  };
}

export function mapProfile(row: ProfileRow) {
  return {
    id: row.id,
    nome: row.nome,
    papel: row.papel,
    instituicao: row.instituicao ?? undefined,
    criadoEm: row.criado_em
  };
}
