import { createClient } from "@/lib/supabase/server";

export default async function PesquisadoresPage() {
  const supabase = createClient();
  const { data: pesquisadores } = await supabase
    .from("profiles")
    .select("id, nome, instituicao, criado_em")
    .eq("papel", "pesquisador")
    .order("nome", { ascending: true });

  const lista = pesquisadores ?? [];
  const comContagem = await Promise.all(
    lista.map(async (p) => {
      const { count } = await supabase
        .from("plants")
        .select("id", { count: "exact", head: true })
        .eq("autor_id", p.id);
      return { ...p, verbetes: count ?? 0 };
    })
  );

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-12">
      <h1 className="font-display text-3xl text-ink">Pesquisadores</h1>
      <div className="mt-8 divide-y divide-line">
        {comContagem.map((p) => (
          <div key={p.id} className="py-4 font-sans text-sm flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-ink">{p.nome}</p>
              <p className="text-ink/50 text-xs">{p.instituicao ?? "Instituição não informada"}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[11px] text-ink/40">{p.verbetes} verbete(s)</span>
              <span className="font-mono text-[11px] uppercase tracking-widest text-moss border border-moss/40 px-2 py-0.5 rounded-sm">
                Pesquisador
              </span>
            </div>
          </div>
        ))}
      </div>

      {comContagem.length === 0 && (
        <p className="font-sans text-ink/50 mt-10 italic">Nenhum pesquisador cadastrado ainda.</p>
      )}
    </div>
  );
}
