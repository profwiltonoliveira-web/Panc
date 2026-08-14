import Link from "next/link";
import { DEMO_PLANTS } from "@/lib/demo-data";

export default function PainelAdminPage() {
  const resumo = {
    total: DEMO_PLANTS.length,
    publicados: DEMO_PLANTS.filter((p) => p.status === "publicado").length,
    rascunhos: DEMO_PLANTS.filter((p) => p.status === "rascunho").length,
    pendentesRevisao: DEMO_PLANTS.filter((p) => p.status === "em_revisao").length,
    pesquisadores: 1, // exemplo — em produção: count(profiles WHERE papel = 'pesquisador')
    fotografias: DEMO_PLANTS.reduce((acc, p) => acc + p.fotos.length, 0)
  };

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-12">
      <h1 className="font-display text-3xl text-ink">Painel administrativo</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-8">
        <Resumo label="Verbetes" valor={resumo.total} />
        <Resumo label="Publicados" valor={resumo.publicados} />
        <Resumo label="Rascunhos" valor={resumo.rascunhos} />
        <Resumo label="Pendentes de revisão" valor={resumo.pendentesRevisao} />
        <Resumo label="Pesquisadores" valor={resumo.pesquisadores} />
        <Resumo label="Fotografias" valor={resumo.fotografias} />
      </div>

      <div className="mt-10 flex flex-wrap gap-6 font-sans text-sm">
        <Link href="/admin/revisao" className="text-moss hover:text-clay">Fila de revisão →</Link>
        <Link href="/admin/verbetes" className="text-moss hover:text-clay">Todos os verbetes →</Link>
        <Link href="/admin/pesquisadores" className="text-moss hover:text-clay">Pesquisadores →</Link>
      </div>
    </div>
  );
}

function Resumo({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="border border-line rounded-sm p-4 bg-white">
      <p className="font-mono text-[11px] uppercase tracking-widest text-moss">{label}</p>
      <p className="font-display text-3xl text-ink mt-1">{valor}</p>
    </div>
  );
}
