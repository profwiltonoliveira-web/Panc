// Tipos centrais do PANCpedia — espelham o schema em supabase/schema.sql

export type StatusVerbete = "rascunho" | "em_revisao" | "aprovado" | "publicado";
export type PapelUsuario = "administrador" | "pesquisador" | "visitante";

export interface Profile {
  id: string;
  nome: string;
  papel: PapelUsuario;
  instituicao?: string;
  criadoEm: string;
}

export interface Foto {
  id: string;
  plantId: string;
  url: string;
  legenda?: string;
  autoria?: string;
  data?: string;
  localRegistro?: string;
  principal: boolean;
}

export interface RegistroLinguistico {
  id: string;
  plantId: string;
  nomePopular: string;
  variacoes: string[];
  pronuncia?: string;
  significado?: string;
  origemNome?: string;
  usoLinguistico?: string;
  expressoesRelacionadas?: string;
  observacaoLinguistica?: string; // ANÁLISE DOS PESQUISADORES
  fonteRegistro: string; // DADO REGISTRADO / fonte
  etimologia?: {
    origem?: string;
    linguaOrigem?: string;
    significado?: string;
    fonte?: string;
    observacoes?: string;
    naoDeterminada: boolean;
  };
}

export interface SaberComunitario {
  id: string;
  plantId: string;
  descricao: string;
  tipo: "uso_tradicional" | "forma_preparo" | "memoria" | "pratica" | "relato_campo";
  fonteCompativel: string; // identificação da fonte respeitando critérios éticos
  registradoEm: string;
}

export interface ReferenciaBibliografica {
  id: string;
  plantId: string;
  tipo: "livro" | "artigo" | "trabalho_academico" | "site_institucional" | "catalogo" | "entrevista" | "registro_campo" | "outro";
  titulo: string;
  autor?: string;
  ano?: string;
  fonte?: string;
  url?: string;
}

export interface Localizacao {
  id: string;
  plantId?: string;
  latitude: number;
  longitude: number;
  tipo: "ocorrencia" | "registro_campo" | "observacao" | "outro";
  descricao?: string;
}

export interface Plant {
  id: string;
  slug: string;
  nomeDestaque: string; // nome de exibição principal do verbete
  nomeCientifico?: string;
  familia?: string;
  genero?: string;
  especie?: string;
  caracteristicas?: string;
  habitat?: string;
  ocorrencia?: string;
  observacoesBotanicas?: string;
  parteUtilizada?: string;
  formaPreparo?: string;
  formaConsumo?: string;
  receitas?: string;
  observacoesUso?: string;
  descricaoCurta: string;
  status: StatusVerbete;
  categoria?: string;
  autorId: string;
  fotos: Foto[];
  registroLinguistico?: RegistroLinguistico;
  saberes: SaberComunitario[];
  referencias: ReferenciaBibliografica[];
  localizacoes: Localizacao[];
  demonstracao: boolean; // true = dado fictício, nunca deve ser tratado como publicação real
}
