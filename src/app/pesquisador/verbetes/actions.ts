"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/slug";

// Todas as escritas abaixo passam pelo cliente Supabase autenticado do
// usuário (cookies de sessão), nunca pelo cliente de service role — a
// autorização real acontece nas policies de RLS em supabase/schema.sql.
// As checagens feitas aqui são uma segunda camada (mensagens de erro claras
// para a interface), não a única barreira.

async function requireUser() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("É necessário estar autenticado.");
  return { supabase, user };
}

function texto(formData: FormData, campo: string): string | null {
  const valor = formData.get(campo);
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

function textoObrigatorio(formData: FormData, campo: string): string {
  const valor = texto(formData, campo);
  if (!valor) throw new Error(`O campo "${campo}" é obrigatório.`);
  return valor;
}

function numero(formData: FormData, campo: string): number {
  const valor = texto(formData, campo);
  const n = valor ? Number(valor) : NaN;
  if (Number.isNaN(n)) throw new Error(`O campo "${campo}" precisa ser um número.`);
  return n;
}

function revalidarVerbete(id: string) {
  revalidatePath(`/pesquisador/verbetes/${id}`);
  revalidatePath("/pesquisador/verbetes");
  revalidatePath("/pesquisador");
  revalidatePath("/admin/revisao");
  revalidatePath("/admin/verbetes");
  revalidatePath("/admin");
}

// ---------------------------------------------------------------------------
// Verbete — criação, conteúdo, fluxo editorial
// ---------------------------------------------------------------------------

export async function criarVerbete(formData: FormData) {
  const { supabase, user } = await requireUser();

  const nomeDestaque = textoObrigatorio(formData, "nome_destaque");
  const descricaoCurta = textoObrigatorio(formData, "descricao_curta");
  const nomeCientifico = texto(formData, "nome_cientifico");

  const slugBase = slugify(nomeDestaque) || "verbete";
  const slug = `${slugBase}-${randomUUID().slice(0, 8)}`;

  const { data, error } = await supabase
    .from("plants")
    .insert({
      slug,
      nome_destaque: nomeDestaque,
      nome_cientifico: nomeCientifico,
      descricao_curta: descricaoCurta,
      status: "rascunho",
      autor_id: user.id,
      demonstracao: false
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível criar o verbete: ${error?.message ?? "erro desconhecido"}`);
  }

  revalidatePath("/pesquisador/verbetes");
  revalidatePath("/pesquisador");
  redirect(`/pesquisador/verbetes/${data.id}`);
}

export async function salvarConteudo(id: string, formData: FormData) {
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("plants")
    .update({
      nome_destaque: textoObrigatorio(formData, "nome_destaque"),
      nome_cientifico: texto(formData, "nome_cientifico"),
      familia: texto(formData, "familia"),
      genero: texto(formData, "genero"),
      especie: texto(formData, "especie"),
      caracteristicas: texto(formData, "caracteristicas"),
      habitat: texto(formData, "habitat"),
      ocorrencia: texto(formData, "ocorrencia"),
      observacoes_botanicas: texto(formData, "observacoes_botanicas"),
      parte_utilizada: texto(formData, "parte_utilizada"),
      forma_preparo: texto(formData, "forma_preparo"),
      forma_consumo: texto(formData, "forma_consumo"),
      receitas: texto(formData, "receitas"),
      observacoes_uso: texto(formData, "observacoes_uso"),
      descricao_curta: textoObrigatorio(formData, "descricao_curta"),
      atualizado_em: new Date().toISOString()
    })
    .eq("id", id);

  if (error) {
    throw new Error(
      `Não foi possível salvar o rascunho (verifique se o verbete ainda está em rascunho ou em revisão — depois de aprovado só o administrador pode alterá-lo): ${error.message}`
    );
  }

  revalidarVerbete(id);
}

// Combina os dados gerais do verbete com o registro linguístico em um único
// envio de formulário — são duas tabelas, mas uma só experiência de edição.
export async function salvarVerbeteCompleto(id: string, formData: FormData) {
  await salvarConteudo(id, formData);
  await salvarRegistroLinguistico(id, formData);
}

export async function enviarParaRevisao(id: string) {
  const { supabase, user } = await requireUser();

  const { data: atual, error: erroConsulta } = await supabase
    .from("plants")
    .select("status")
    .eq("id", id)
    .single();

  if (erroConsulta || !atual) {
    throw new Error("Verbete não encontrado ou sem permissão de acesso.");
  }
  if (atual.status !== "rascunho") {
    throw new Error("Só é possível enviar para revisão um verbete que esteja em rascunho.");
  }

  const { error } = await supabase.from("plants").update({ status: "em_revisao" }).eq("id", id);
  if (error) {
    throw new Error(`Não foi possível enviar para revisão: ${error.message}`);
  }

  await supabase.from("revisions").insert({
    plant_id: id,
    revisor_id: user.id,
    status_anterior: "rascunho",
    status_novo: "em_revisao",
    comentario: null
  });

  revalidarVerbete(id);
}

// ---------------------------------------------------------------------------
// Registro linguístico — "A palavra em Itamira" (um por verbete)
// ---------------------------------------------------------------------------

export async function salvarRegistroLinguistico(plantId: string, formData: FormData) {
  const { supabase } = await requireUser();

  const variacoesRaw = texto(formData, "variacoes");
  const variacoes = variacoesRaw
    ? variacoesRaw.split(",").map((v) => v.trim()).filter(Boolean)
    : [];
  const naoDeterminada = formData.get("etimologia_nao_determinada") === "on";

  const payload = {
    plant_id: plantId,
    nome_popular: textoObrigatorio(formData, "nome_popular"),
    variacoes,
    pronuncia: texto(formData, "pronuncia"),
    significado: texto(formData, "significado"),
    origem_nome: texto(formData, "origem_nome"),
    uso_linguistico: texto(formData, "uso_linguistico"),
    expressoes_relacionadas: texto(formData, "expressoes_relacionadas"),
    observacao_linguistica: texto(formData, "observacao_linguistica"),
    fonte_registro: textoObrigatorio(formData, "fonte_registro"),
    etimologia_origem: naoDeterminada ? null : texto(formData, "etimologia_origem"),
    etimologia_lingua_origem: naoDeterminada ? null : texto(formData, "etimologia_lingua_origem"),
    etimologia_significado: naoDeterminada ? null : texto(formData, "etimologia_significado"),
    etimologia_fonte: naoDeterminada ? null : texto(formData, "etimologia_fonte"),
    etimologia_observacoes: naoDeterminada ? null : texto(formData, "etimologia_observacoes"),
    etimologia_nao_determinada: naoDeterminada
  };

  const { data: existente } = await supabase
    .from("linguistic_records")
    .select("id")
    .eq("plant_id", plantId)
    .maybeSingle();

  const { error } = existente
    ? await supabase.from("linguistic_records").update(payload).eq("id", existente.id)
    : await supabase.from("linguistic_records").insert(payload);

  if (error) throw new Error(`Não foi possível salvar o registro linguístico: ${error.message}`);
  revalidarVerbete(plantId);
}

// ---------------------------------------------------------------------------
// Saberes de Itamira
// ---------------------------------------------------------------------------

export async function adicionarSaber(plantId: string, formData: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("community_knowledge").insert({
    plant_id: plantId,
    descricao: textoObrigatorio(formData, "descricao"),
    tipo: textoObrigatorio(formData, "tipo"),
    fonte_compativel: textoObrigatorio(formData, "fonte_compativel"),
    registrado_em: texto(formData, "registrado_em") ?? new Date().toISOString().slice(0, 10)
  });
  if (error) throw new Error(`Não foi possível adicionar o saber: ${error.message}`);
  revalidarVerbete(plantId);
}

export async function removerSaber(plantId: string, id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("community_knowledge").delete().eq("id", id);
  if (error) throw new Error(`Não foi possível remover: ${error.message}`);
  revalidarVerbete(plantId);
}

// ---------------------------------------------------------------------------
// Referências bibliográficas
// ---------------------------------------------------------------------------

export async function adicionarReferencia(plantId: string, formData: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("references").insert({
    plant_id: plantId,
    tipo: textoObrigatorio(formData, "tipo"),
    titulo: textoObrigatorio(formData, "titulo"),
    autor: texto(formData, "autor"),
    ano: texto(formData, "ano"),
    fonte: texto(formData, "fonte"),
    url: texto(formData, "url")
  });
  if (error) throw new Error(`Não foi possível adicionar a referência: ${error.message}`);
  revalidarVerbete(plantId);
}

export async function removerReferencia(plantId: string, id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("references").delete().eq("id", id);
  if (error) throw new Error(`Não foi possível remover: ${error.message}`);
  revalidarVerbete(plantId);
}

// ---------------------------------------------------------------------------
// Registros de campo
// ---------------------------------------------------------------------------

export async function adicionarRegistroCampo(plantId: string, formData: FormData) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("field_records").insert({
    plant_id: plantId,
    pesquisador_id: user.id,
    descricao: textoObrigatorio(formData, "descricao"),
    data: texto(formData, "data") ?? new Date().toISOString().slice(0, 10)
  });
  if (error) throw new Error(`Não foi possível adicionar o registro de campo: ${error.message}`);
  revalidarVerbete(plantId);
}

export async function removerRegistroCampo(plantId: string, id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("field_records").delete().eq("id", id);
  if (error) throw new Error(`Não foi possível remover: ${error.message}`);
  revalidarVerbete(plantId);
}

// ---------------------------------------------------------------------------
// Localizações (mapa)
// ---------------------------------------------------------------------------

export async function adicionarLocalizacao(plantId: string, formData: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("locations").insert({
    plant_id: plantId,
    latitude: numero(formData, "latitude"),
    longitude: numero(formData, "longitude"),
    tipo: textoObrigatorio(formData, "tipo"),
    descricao: texto(formData, "descricao")
  });
  if (error) throw new Error(`Não foi possível adicionar a localização: ${error.message}`);
  revalidarVerbete(plantId);
  revalidatePath("/mapa");
}

export async function removerLocalizacao(plantId: string, id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("locations").delete().eq("id", id);
  if (error) throw new Error(`Não foi possível remover: ${error.message}`);
  revalidarVerbete(plantId);
  revalidatePath("/mapa");
}

// ---------------------------------------------------------------------------
// Fotografias — upload real para o Supabase Storage (bucket "fotos-verbetes")
// ---------------------------------------------------------------------------

const TIPOS_IMAGEM_ACEITOS = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const TAMANHO_MAXIMO_BYTES = 8 * 1024 * 1024; // 8 MB

export async function enviarFoto(plantId: string, formData: FormData) {
  const { supabase } = await requireUser();

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    throw new Error("Selecione uma fotografia para enviar.");
  }
  if (!TIPOS_IMAGEM_ACEITOS.includes(arquivo.type)) {
    throw new Error("Formato de imagem não suportado. Envie JPEG, PNG, WEBP ou GIF.");
  }
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    throw new Error("A fotografia excede o tamanho máximo de 8 MB.");
  }

  const extensao = arquivo.name.includes(".") ? arquivo.name.split(".").pop() : "jpg";
  const caminho = `${plantId}/${randomUUID()}.${extensao}`;

  const { error: erroUpload } = await supabase.storage.from("fotos-verbetes").upload(caminho, arquivo, {
    contentType: arquivo.type,
    upsert: false
  });
  if (erroUpload) {
    throw new Error(`Não foi possível enviar a fotografia: ${erroUpload.message}`);
  }

  const principal = formData.get("principal") === "on";
  if (principal) {
    await supabase.from("plant_photos").update({ principal: false }).eq("plant_id", plantId);
  }

  const { error: erroInsert } = await supabase.from("plant_photos").insert({
    plant_id: plantId,
    url: caminho,
    legenda: texto(formData, "legenda"),
    autoria: texto(formData, "autoria"),
    data: texto(formData, "data"),
    local_registro: texto(formData, "local_registro"),
    principal
  });

  if (erroInsert) {
    // Reverte o upload se não conseguiu registrar a foto, para não deixar
    // arquivo órfão no Storage.
    await supabase.storage.from("fotos-verbetes").remove([caminho]);
    throw new Error(`Não foi possível registrar a fotografia: ${erroInsert.message}`);
  }

  revalidarVerbete(plantId);
}

export async function removerFoto(plantId: string, id: string) {
  const { supabase } = await requireUser();

  const { data: foto } = await supabase.from("plant_photos").select("url").eq("id", id).maybeSingle();
  if (!foto) throw new Error("Fotografia não encontrada ou sem permissão de acesso.");

  const { error } = await supabase.from("plant_photos").delete().eq("id", id);
  if (error) throw new Error(`Não foi possível remover a fotografia: ${error.message}`);

  await supabase.storage.from("fotos-verbetes").remove([foto.url]);
  revalidarVerbete(plantId);
}

export async function definirFotoPrincipal(plantId: string, id: string) {
  const { supabase } = await requireUser();
  await supabase.from("plant_photos").update({ principal: false }).eq("plant_id", plantId);
  const { error } = await supabase.from("plant_photos").update({ principal: true }).eq("id", id);
  if (error) throw new Error(`Não foi possível definir a fotografia principal: ${error.message}`);
  revalidarVerbete(plantId);
}
