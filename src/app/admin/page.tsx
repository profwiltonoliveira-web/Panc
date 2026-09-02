import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  aprovado: "Aprovado",
  publicado: "Publicado",
};

async function excluirVerbete(id: string) {
  "use server";

  const supabase = createClient();

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    throw new Error("Usuário não autenticado.");
  }

  const { error: fotosError } = await supabase
    .from("plant_photos")
    .delete()
    .eq("plant_id", id);

  if (fotosError) {
    throw new Error("Não foi possível excluir as fotografias.");
  }

  const { error } = await supabase
    .from("plants")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error("Não foi possível excluir o verbete.");
  }

  revalidatePath("/admin/verbetes");
  revalidatePath("/admin");
}

export default async function AdminVerbetesPage() {
  const supabase = createClient();

  const { data } = await supabase
    .from("plants")
    .select(
      "id, nome_destaque, status, categories ( nome ), profiles ( nome )"
    )
    .order("atualizado_em", { ascending: false });

  const verbetes = (data ?? []) as unknown as {
    id: string;
    nome_destaque: string;
    status: string;
    categories: { nome: string } | null;
    profiles: { nome: string } | null;
  }[];

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-12">
      <h1 className="font-display text-3xl text-ink">
        Todos os verbetes
      </h1>

      <table className="w-full mt-8 font-sans text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-line text-ink/50 font-mono text-xs uppercase tracking-widest">
            <th className="py-2">Verbete</th>
            <th className="py-2">Status</th>
            <th className="py-2">Categoria</th>
            <th className="py-2">Pesquisador</th>
            <th className="py-2">Ação</th>
          </tr>
        </thead>

        <tbody>
          {verbetes.map((p) => (
            <tr key={p.id} className="border-b border-line/60">
              <td className="py-3 text-ink">
                {p.nome_destaque}
              </td>

              <td className="py-3 font-mono text-[11px] uppercase tracking-widest text-moss">
                {STATUS_LABEL[p.status] ?? p.status}
              </td>

              <td className="py-3 text-ink/60">
                {p.categories?.nome ?? "—"}
              </td>

              <td className="py-3 text-ink/60">
                {p.profiles?.nome ?? "—"}
              </td>

              <td className="py-3">
                <form action={excluirVerbete.bind(null, p.id)}>
                  <button
                    type="submit"
                    className="text-clay hover:underline"
                  >
                    Excluir
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {verbetes.length === 0 && (
        <p className="font-sans text-ink/50 mt-10 italic">
          Nenhum verbete cadastrado ainda.
        </p>
      )}
    </div>
  );
}
