import Link from "next/link";
import { DEMO_PLANTS } from "@/lib/demo-data";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  aprovado: "Aprovado",
  publicado: "Publicado"
};

export default function MeusVerbetesPage() {
  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-12">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-ink">Meus verbetes</h1>
        <Link href="/pesquisador/verbetes/novo" className="font-sans text-sm text-moss hover:text-clay">
          + Novo verbete
        </Link>
      </div>

      <table className="w-full mt-8 font-sans text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-line text-ink/50 font-mono text-xs uppercase tracking-widest">
            <th className="py-2">Verbete</th>
            <th className="py-2">Status</th>
            <th className="py-2 text-right">Ação</th>
          </tr>
        </thead>
        <tbody>
          {DEMO_PLANTS.map((p) => (
            <tr key={p.id} className="border-b border-line/60">
              <td className="py-3 text-ink">{p.nomeDestaque}</td>
              <td className="py-3">
                <span className="font-mono text-[11px] uppercase tracking-widest text-moss border border-moss/40 px-2 py-0.5 rounded-sm">
                  {STATUS_LABEL[p.status]}
                </span>
              </td>
              <td className="py-3 text-right">
                <Link href={`/pesquisador/verbetes/${p.id}`} className="text-moss hover:text-clay">
                  Editar →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
