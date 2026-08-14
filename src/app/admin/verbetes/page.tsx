import { createClient } from "@/lib/supabase/server";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  aprovado: "Aprovado",
  publicado: "Publicado"
};

export default async function AdminVerbetesPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("plants")
    .select("id, nome_destaque, status, categories ( nome ), profiles ( nome )")
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
      <h1 className="font-display text-3xl text-ink">Todos os verbetes</h1>
      <table className="w-full mt-8 font-sans text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-line text-ink/50 font-mono text-xs uppercase tracking-widest">
            <th className="py-2">Verbete</th>
            <th className="py-2">Status</th>
            <th className="py-2">Categoria</th>
            <th className="py-2">Pesquisador</th>
          </tr>
        </thead>
        <tbody>
          {verbetes.map((p) => (
            <tr key={p.id} className="border-b border-line/60">
              <td className="py-3 text-ink">{p.nome_destaque}</td>
              <td className="py-3 font-mono text-[11px] uppercase tracking-widest text-moss">
                {STATUS_LABEL[p.status]}
              </td>
              <td className="py-3 text-ink/60">{p.categories?.nome ?? "—"}</td>
              <td className="py-3 text-ink/60">{p.profiles?.nome ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {verbetes.length === 0 && (
        <p className="font-sans text-ink/50 mt-10 italic">Nenhum verbete cadastrado ainda.</p>
      )}
    </div>
  );
}
