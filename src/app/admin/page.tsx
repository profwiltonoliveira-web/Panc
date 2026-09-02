import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

async function contarLinhas(
  supabase: ReturnType<typeof createClient>,
  tabela: string,
  filtro?: { coluna: string; valor: string }
) {
  let query = supabase.from(tabela).select("id", { count: "exact", head: true });
  if (filtro) query = query.eq(filtro.coluna, filtro.valor);
  const { count } = await query;
  return count ?? 0;
}

export default async function PainelAdminPage() {
  const supabase = createClient();

  const [total, publicados, rascunhos, pendentesRevisao, pesquisadores, fotografias] =
    await Promise.all([
      contarLinhas(supabase, "plants"),
      contarLinhas(supabase, "plants", {
        coluna: "status",
        valor: "publicado",
      }),
      contarLinhas(supabase, "plants", {
        coluna: "status",
        valor: "rascunho",
      }),
      contarLinhas(supabase, "plants", {
        coluna: "status",
        valor: "em_revisao",
      }),
      contarLinhas(supabase, "profiles", {
        coluna: "papel",
        valor: "pesquisador",
      }),
      contarLinhas(supabase, "plant_photos"),
    ]);

  const resumo = {
    total,
    publicados,
    rascunhos,
    pendentesRevisao,
    pesquisadores,
    fotografias,
  };

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-12">
      <h1 className="font-display text-3xl text-ink">
        Painel administrativo
      </h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-8">
        <Resumo label="Verbetes" valor={resumo.total} />
        <Resumo label="Publicados" valor={resumo.publicados} />
        <Resumo label="Rascunhos" valor={resumo.rascunhos} />
        <Resumo
          label="Pendentes de revisão"
          valor={resumo.pendentesRevisao}
        />
        <Resumo label="Pesquisadores" valor={resumo.pesquisadores} />
        <Resumo label="Fotografias" valor={resumo.fotografias} />
      </div>

      <div className="mt-10 flex flex-wrap gap-6 font-sans text-sm">
        <Link
          href="/admin/revisao"
          className="text-moss hover:text-clay"
        >
          Fila de revisão →
        </Link>

        <Link
          href="/admin/verbetes"
          className="text-moss hover:text-clay"
        >
          Todos os verbetes →
        </Link>

        <Link
          href="/admin/pesquisadores"
          className="text-moss hover:text-clay"
        >
          Pesquisadores →
        </Link>
      </div>
    </div>
  );
}

function Resumo({
  label,
  valor,
}: {
  label: string;
  valor: number;
}) {
  return (
    <div className="border border-line rounded-sm p-4 bg-white">
      <p className="font-mono text-[11px] uppercase tracking-widest text-moss">
        {label}
      </p>
      <p className="font-display text-3xl text-ink mt-1">
        {valor}
      </p>
    </div>
  );
}
