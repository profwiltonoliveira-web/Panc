import { createClient } from "@/lib/supabase/server";
import { aprovarVerbete, devolverParaCorrecao, publicarVerbete } from "./actions";

export default async function RevisaoPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("plants")
    .select("id, nome_destaque, descricao_curta, status, profiles ( nome )")
    .in("status", ["em_revisao", "aprovado"])
    .order("atualizado_em", { ascending: true });

  const pendentes = (data ?? []) as unknown as {
    id: string;
    nome_destaque: string;
    descricao_curta: string;
    status: "em_revisao" | "aprovado";
    profiles: { nome: string } | null;
  }[];

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-12">
      <h1 className="font-display text-3xl text-ink">Fila de revisão</h1>
      <p className="font-sans text-sm text-ink/60 mt-1">
        Verbetes enviados por pesquisadores, aguardando aprovação, publicação ou correção.
      </p>

      <div className="mt-8 space-y-4">
        {pendentes.map((p) => (
          <div key={p.id} className="border border-line rounded-sm p-4 bg-white space-y-3">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <p className="font-display text-lg text-ink">{p.nome_destaque}</p>
                <p className="font-sans text-xs text-ink/50">{p.descricao_curta}</p>
                {p.profiles?.nome && (
                  <p className="font-mono text-[11px] text-ink/40 mt-1">Pesquisador: {p.profiles.nome}</p>
                )}
              </div>
              <a
                href={`/pesquisador/verbetes/${p.id}`}
                className="font-sans text-xs border border-ink/20 px-3 py-1.5 rounded-sm hover:border-clay"
              >
                Visualizar / editar
              </a>
            </div>

            {p.status === "em_revisao" ? (
              <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-line/60">
                <form action={aprovarVerbete.bind(null, p.id)} className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="font-sans text-xs bg-moss text-paper px-3 py-1.5 rounded-sm hover:bg-moss-dark"
                  >
                    Aprovar
                  </button>
                </form>
                <form action={devolverParaCorrecao.bind(null, p.id)} className="flex-1 flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    name="comentario"
                    required
                    placeholder="Motivo da devolução (obrigatório)"
                    className="flex-1 border border-line rounded-sm px-3 py-1.5 text-xs font-sans"
                  />
                  <button
                    type="submit"
                    className="font-sans text-xs border border-clay text-clay px-3 py-1.5 rounded-sm hover:bg-clay hover:text-paper whitespace-nowrap"
                  >
                    Devolver para correção
                  </button>
                </form>
              </div>
            ) : (
              <div className="pt-2 border-t border-line/60">
                <form action={publicarVerbete.bind(null, p.id)}>
                  <button
                    type="submit"
                    className="font-sans text-xs bg-dende text-ink px-3 py-1.5 rounded-sm hover:opacity-90"
                  >
                    Publicar
                  </button>
                </form>
              </div>
            )}
          </div>
        ))}

        {pendentes.length === 0 && (
          <p className="font-sans text-sm text-ink/50 italic">Nenhum verbete pendente de revisão no momento.</p>
        )}
      </div>
    </div>
  );
}
