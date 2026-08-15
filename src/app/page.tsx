import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import PlantCard from "@/components/PlantCard";
import { createClient } from "@/lib/supabase/server";
import { PLANT_PUBLIC_SELECT, PlantRow, mapPlantRow } from "@/lib/supabase/mappers";
import { comUrlAssinada } from "@/lib/supabase/photo-url";

async function buscarDestaques() {
  const supabase = createClient();
  const { data } = await supabase
    .from("plants")
    .select(PLANT_PUBLIC_SELECT)
    .eq("status", "publicado")
    .order("atualizado_em", { ascending: false })
    .limit(3);

  const plantas = ((data as PlantRow[] | null) ?? []).map(mapPlantRow);
  return Promise.all(
    plantas.map(async (planta) => ({ ...planta, fotos: await comUrlAssinada(planta.fotos) }))
  );
}

const CAMINHOS = [
  {
    href: "/dicionario",
    titulo: "Dicionário",
    descricao: "Todos os verbetes publicados, em ordem alfabética",
    destaque: true
  },
  { href: "/mapa", titulo: "Mapa de Itamira", descricao: "Ocorrências no território" },
  { href: "/sobre", titulo: "Saberes de Itamira", descricao: "Memória, uso tradicional e patrimônio lexical" },
  { href: "/sobre", titulo: "Sobre o projeto", descricao: "A pesquisa por trás do PANCpedia" }
];

export default async function HomePage() {
  const destaques = await buscarDestaques();

  return (
    <div>
      <section className="max-w-6xl mx-auto px-5 sm:px-8 pt-14 pb-16">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-12 lg:gap-16 items-center">
          {/* IDENTIDADE + BUSCA + CAMINHOS */}
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-moss mb-3">
              Itamira · Aporá · Bahia
            </p>
            <h1 className="font-display text-4xl sm:text-5xl font-semibold text-ink leading-[1.08] text-balance">
              PANCpedia
            </h1>
            <p className="font-body text-lg sm:text-xl text-ink/80 mt-2 max-w-md leading-snug">
              Dicionário Enciclopédico Digital das Plantas Alimentícias Não
              Convencionais de Itamira
            </p>
            <p className="font-sans text-ink/70 mt-4 max-w-md leading-relaxed">
              Plantas, palavras e saberes de Itamira reunidos em um dicionário vivo.
            </p>

            <div className="mt-8 max-w-xl">
              <SearchBar large />
            </div>

            <p className="font-body italic text-sm text-ink/45 mt-5 max-w-md">
              Onde as plantas encontram as palavras e os saberes de Itamira.
            </p>

            <nav aria-label="Caminhos principais do PANCpedia" className="mt-8 grid grid-cols-2 gap-3 max-w-lg">
              {CAMINHOS.map((caminho) => (
                <Link
                  key={`${caminho.href}-${caminho.titulo}`}
                  href={caminho.href}
                  className={`group block rounded-sm px-4 py-3.5 border transition-colors ${
                    caminho.destaque
                      ? "border-moss bg-white shadow-sm"
                      : "border-line/70 bg-white/70 hover:border-moss/60"
                  }`}
                >
                  <p
                    className={`font-display text-base leading-tight transition-colors ${
                      caminho.destaque ? "text-moss-dark" : "text-ink"
                    } group-hover:text-clay`}
                  >
                    {caminho.titulo}
                  </p>
                  <p className="font-sans text-xs text-ink/50 mt-1 leading-snug">{caminho.descricao}</p>
                </Link>
              ))}
            </nav>
          </div>

          {/* O QUE O DICIONÁRIO REÚNE — não é uma ilustração botânica: a
              botânica é só um dos quatro eixos, no mesmo peso que os outros
              três, para não passar a impressão de catálogo de plantas. */}
          <div className="hidden lg:block" aria-hidden>
            <EixosDoDicionario />
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-card">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="font-display text-2xl text-ink">Verbetes em destaque</h2>
            <Link href="/dicionario" className="font-mono text-xs uppercase tracking-widest text-moss hover:text-clay">
              Ver dicionário completo →
            </Link>
          </div>

          {destaques.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {destaques.map((plant) => (
                <PlantCard key={plant.id} plant={plant} />
              ))}
            </div>
          ) : (
            <p className="font-sans text-ink/50 italic">
              Nenhum verbete publicado ainda. Assim que a revisão editorial
              aprovar os primeiros verbetes, eles aparecerão aqui.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

const EIXOS = [
  { titulo: "Plantas", descricao: "Identificação botânica e uso alimentar", Icone: IconePlanta },
  { titulo: "Palavras", descricao: "Nome popular, etimologia, pronúncia", Icone: IconePalavra },
  { titulo: "Saberes", descricao: "Memória e uso tradicional da comunidade", Icone: IconeSaber },
  { titulo: "Território", descricao: "Ocorrências no espaço de Itamira", Icone: IconeTerritorio }
];

// O que o PANCpedia reúne — não uma ilustração botânica isolada: os quatro
// eixos do dicionário (a dimensão linguística tem o mesmo peso visual das
// demais, de propósito). Altura definida pelo próprio conteúdo, não por
// uma proporção fixa — evita cortar qualquer elemento em telas diferentes.
// Ícones em SVG inline, sem imagem externa, sem nova dependência.
function EixosDoDicionario() {
  return (
    <div className="border border-line rounded-sm bg-card px-8 py-9">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-moss mb-7">
        Plantas · Palavras · Saberes · Território
      </p>
      <ul className="space-y-6">
        {EIXOS.map((eixo) => (
          <li key={eixo.titulo} className="flex items-start gap-4">
            <eixo.Icone className="text-moss shrink-0 mt-0.5" />
            <div>
              <p className="font-display text-base text-ink leading-tight">{eixo.titulo}</p>
              <p className="font-sans text-xs text-ink/55 mt-0.5 leading-snug">{eixo.descricao}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-moss/50 mt-7 pt-5 border-t border-line/70">
        PANCpedia · Itamira
      </p>
    </div>
  );
}

function IconePlanta({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20V9" />
      <path d="M12 13c-3.5 0-6-2.5-6.5-6.5C9 6 12 8 12 13Z" />
      <path d="M12 10c3.5 0 6-2.2 6.5-6C15 4 12 6 12 10Z" />
    </svg>
  );
}

function IconePalavra({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M9 5 6 19" />
      <path d="M18 5l-3 14" />
    </svg>
  );
}

function IconeSaber({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="12" cy="7" r="2.3" />
      <circle cx="6.5" cy="16.5" r="2.3" />
      <circle cx="17.5" cy="16.5" r="2.3" />
      <path d="M10.3 8.9 7.9 14.4" />
      <path d="M13.7 8.9l2.4 5.5" />
      <path d="M9 16.5h6" />
    </svg>
  );
}

function IconeTerritorio({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.2" />
    </svg>
  );
}
