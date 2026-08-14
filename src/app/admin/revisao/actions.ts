"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Verificação de papel no servidor, além da RLS: o middleware já bloqueia o
// acesso à página /admin/revisao para quem não é administrador, mas uma
// Server Action pode em tese ser invocada diretamente — por isso a checagem
// é repetida aqui, e a policy "administrador acessa todos os verbetes" no
// banco é a barreira final, independente do que esta função decidir.
async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("É necessário estar autenticado.");

  const { data: profile } = await supabase.from("profiles").select("papel").eq("id", user.id).single();
  if (profile?.papel !== "administrador") {
    throw new Error("Apenas administradores podem revisar verbetes.");
  }
  return { supabase, user };
}

function revalidarTudo(id: string, slug?: string) {
  revalidatePath("/admin/revisao");
  revalidatePath("/admin/verbetes");
  revalidatePath("/admin");
  revalidatePath("/pesquisador/verbetes");
  revalidatePath(`/pesquisador/verbetes/${id}`);
  revalidatePath("/pesquisador");
  revalidatePath("/dicionario");
  revalidatePath("/busca");
  revalidatePath("/mapa");
  revalidatePath("/referencias");
  revalidatePath("/");
  if (slug) revalidatePath(`/panc/${slug}`);
}

async function buscarVerbete(supabase: ReturnType<typeof createClient>, id: string) {
  const { data, error } = await supabase.from("plants").select("id, slug, status").eq("id", id).single();
  if (error || !data) throw new Error("Verbete não encontrado.");
  return data;
}

export async function aprovarVerbete(id: string, formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const verbete = await buscarVerbete(supabase, id);

  if (verbete.status !== "em_revisao") {
    throw new Error("Só é possível aprovar um verbete que esteja em revisão.");
  }

  const comentarioBruto = formData.get("comentario");
  const comentario = typeof comentarioBruto === "string" && comentarioBruto.trim() !== "" ? comentarioBruto.trim() : null;

  const { error } = await supabase.from("plants").update({ status: "aprovado" }).eq("id", id);
  if (error) throw new Error(`Não foi possível aprovar: ${error.message}`);

  await supabase.from("revisions").insert({
    plant_id: id,
    revisor_id: user.id,
    status_anterior: "em_revisao",
    status_novo: "aprovado",
    comentario
  });

  revalidarTudo(id, verbete.slug);
}

export async function publicarVerbete(id: string) {
  const { supabase, user } = await requireAdmin();
  const verbete = await buscarVerbete(supabase, id);

  if (verbete.status !== "aprovado") {
    throw new Error("Só é possível publicar um verbete que já esteja aprovado.");
  }

  const { error } = await supabase.from("plants").update({ status: "publicado" }).eq("id", id);
  if (error) throw new Error(`Não foi possível publicar: ${error.message}`);

  await supabase.from("revisions").insert({
    plant_id: id,
    revisor_id: user.id,
    status_anterior: "aprovado",
    status_novo: "publicado",
    comentario: null
  });

  revalidarTudo(id, verbete.slug);
}

export async function devolverParaCorrecao(id: string, formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const verbete = await buscarVerbete(supabase, id);

  if (verbete.status !== "em_revisao") {
    throw new Error("Só é possível devolver para correção um verbete que esteja em revisão.");
  }

  const comentarioBruto = formData.get("comentario");
  const comentario = typeof comentarioBruto === "string" ? comentarioBruto.trim() : "";
  if (!comentario) {
    throw new Error("Explique ao pesquisador o motivo da devolução.");
  }

  const { error } = await supabase.from("plants").update({ status: "rascunho" }).eq("id", id);
  if (error) throw new Error(`Não foi possível devolver: ${error.message}`);

  await supabase.from("revisions").insert({
    plant_id: id,
    revisor_id: user.id,
    status_anterior: "em_revisao",
    status_novo: "rascunho",
    comentario
  });

  revalidarTudo(id, verbete.slug);
}
