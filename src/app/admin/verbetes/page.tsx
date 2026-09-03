import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  aprovado: "Aprovado",
  publicado: "Publicado",
};

async function excluirVerbete(formData: FormData) {
  "use server";

  const id = formData.get("id");

  if (!id || typeof id !== "string") {
    redirect("/admin/verbetes?erro=id-invalido");
  }

  const supabase = createClient();

  const { error } = await supabase.rpc("excluir_verbete_admin", {
    p_plant_id: id,
  });

  if (error) {
    console.error("ERRO RPC excluir_verbete_admin:", error);

    redirect(
      `/admin/verbetes?erro=${encodeURIComponent(
        error.message || "Erro desconhecido ao excluir o verbete."
      )}`
    );
  }

  revalidatePath("/admin/verbetes");
  redirect("/admin/verbetes?excluido=1");
}

export default async function AdminVerbetesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    erro?: string;
    excluido?: string;
  }>;
}) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("plants")
    .select("id, nome_destaque, status, categoria_id, autor_id")
    .order("atualizado_em", { ascending: false });

  const verbetes = data ?? [];

  const params = searchParams ? await searchParams : {};

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12">

      <h1 className="font-display text-3xl text-ink">
        Todos os verbetes
      </h1>

      {params.excluido === "1" && (
        <p className="mt-6 rounded-md border border-line bg-moss/10 px-4 py-3 text-sm text-ink">
          Verbete excluído com sucesso.
        </p>
      )}

      {params.erro && (
        <p className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.erro}
        </p>
      )}

      {error && (
        <p className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          Não foi possível carregar os verbetes.
        </p>
      )}

      <table className="w-full mt-8 font-sans text-sm border-collapse">

        <thead>
          <tr className="text-left border-b border-line text-ink/50 font-mono text-xs uppercase tracking-widest">
            <th className="py-3">Verbete</th>
            <th className="py-3">Status</th>
            <th className="py-3">Categoria</th>
            <th className="py-3">Pesquisador</th>
            <th className="py-3 text-right">Ação</th>
          </tr>
        </thead>

        <tbody>
          {verbetes.map((p) => (
            <tr key={p.id} className="border-b border-line/60">

              <td className="py-4 text-ink">
                {p.nome_destaque}
              </td>

              <td className="py-4 font-mono text-[11px] uppercase tracking-widest text-moss">
                {STATUS_LABEL[p.status] ?? p.status}
              </td>

              <td className="py-4 text-ink/60">
                {p.categoria_id ?? "—"}
              </td>

              <td className="py-4 text-ink/60">
                {p.autor_id ?? "—"}
              </td>

              <td className="py-4 text-right">
                <form action={excluirVerbete}>
                  <input
                    type="hidden"
                    name="id"
                    value={p.id}
                  />

                  <button
                    type="submit"
                    className="font-sans text-xs text-red-600 hover:underline"
                  >
                    Excluir
                  </button>
                </form>
              </td>

            </tr>
          ))}
        </tbody>

      </table>

      {verbetes.length === 0 && !error && (
        <p className="font-sans text-ink/50 mt-10 italic">
          Nenhum verbete cadastrado ainda.
        </p>
      )}

    </div>
  );
}
