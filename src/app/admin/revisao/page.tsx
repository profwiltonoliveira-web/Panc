import { DEMO_PLANTS } from "@/lib/demo-data";

// Em produção: SELECT * FROM plants WHERE status = 'em_revisao'
export default function RevisaoPage() {
  const pendentes = DEMO_PLANTS.filter((p) => p.status === "em_revisao");

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-12">
      <h1 className="font-display text-3xl text-ink">Fila de revisão</h1>
      <p className="font-sans text-sm text-ink/60 mt-1">
        Verbetes enviados por pesquisadores, aguardando aprovação ou correção.
      </p>

      <div className="mt-8 space-y-4">
        {pendentes.map((p) => (
          <div key={p.id} className="border border-line rounded-sm p-4 bg-white flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-display text-lg text-ink">{p.nomeDestaque}</p>
              <p className="font-sans text-xs text-ink/50">{p.descricaoCurta}</p>
            </div>
            <div className="flex gap-2 font-sans text-xs">
              <button className="border border-ink/20 px-3 py-1.5 rounded-sm hover:border-clay">Visualizar</button>
              <button className="border border-ink/20 px-3 py-1.5 rounded-sm hover:border-clay">Editar</button>
              <button className="border border-clay text-clay px-3 py-1.5 rounded-sm hover:bg-clay hover:text-paper">
                Devolver para correção
              </button>
              <button className="bg-moss text-paper px-3 py-1.5 rounded-sm hover:bg-moss-dark">Aprovar</button>
              <button className="bg-dende text-ink px-3 py-1.5 rounded-sm hover:opacity-90">Publicar</button>
            </div>
          </div>
        ))}

        {pendentes.length === 0 && (
          <p className="font-sans text-sm text-ink/50 italic">Nenhum verbete pendente de revisão no momento.</p>
        )}
      </div>
    </div>
  );
}
