import { DEMO_PLANTS } from "@/lib/demo-data";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  aprovado: "Aprovado",
  publicado: "Publicado"
};

export default function AdminVerbetesPage() {
  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-12">
      <h1 className="font-display text-3xl text-ink">Todos os verbetes</h1>
      <table className="w-full mt-8 font-sans text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-line text-ink/50 font-mono text-xs uppercase tracking-widest">
            <th className="py-2">Verbete</th>
            <th className="py-2">Status</th>
            <th className="py-2">Categoria</th>
          </tr>
        </thead>
        <tbody>
          {DEMO_PLANTS.map((p) => (
            <tr key={p.id} className="border-b border-line/60">
              <td className="py-3 text-ink">{p.nomeDestaque}</td>
              <td className="py-3 font-mono text-[11px] uppercase tracking-widest text-moss">
                {STATUS_LABEL[p.status]}
              </td>
              <td className="py-3 text-ink/60">{p.categoria ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
