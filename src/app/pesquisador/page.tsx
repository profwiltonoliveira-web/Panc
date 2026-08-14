import Link from "next/link";
import { DEMO_PLANTS } from "@/lib/demo-data";

// Em produção: filtrar plants WHERE autor_id = usuário autenticado (via Supabase).
export default function PainelPesquisadorPage() {
  const meusVerbetes = DEMO_PLANTS; // exemplo — todos os verbetes de demonstração

  const contagem = {
    rascunho: meusVerbetes.filter((p) => p.status === "rascunho").length,
    em_revisao: meusVerbetes.filter((p) => p.status === "em_revisao").length,
    aprovado: meusVerbetes.filter((p) => p.status === "aprovado").length,
    publicado: meusVerbetes.filter((p) => p.status === "publicado").length
  };

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-12">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink">Painel do pesquisador</h1>
          <p className="font-sans text-sm text-ink/60 mt-1">Seus verbetes, fotografias e registros.</p>
        </div>
        <Link
          href="/pesquisador/verbetes/novo"
          className="font-sans text-sm bg-moss text-paper px-4 py-2 rounded-sm hover:bg-moss-dark"
        >
          + Novo verbete
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
        {Object.entries(contagem).map(([status, n]) => (
          <div key={status} className="border border-line rounded-sm p-4 bg-white">
            <p className="font-mono text-[11px] uppercase tracking-widest text-moss">
              {status.replace("_", " ")}
            </p>
            <p className="font-display text-3xl text-ink mt-1">{n}</p>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <Link href="/pesquisador/verbetes" className="font-sans text-sm text-moss hover:text-clay">
          Ver todos os meus verbetes →
        </Link>
      </div>
    </div>
  );
}
