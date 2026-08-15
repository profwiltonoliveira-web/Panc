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

          {/* ESTUDO BOTÂNICO — ilustração decorativa, sem virar catálogo */}
          <div className="hidden lg:block" aria-hidden>
            <EstudoBotanico />
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

// Ilustração botânica original, em linha, evocando uma prancha de
// herbário — a mesma referência visual do "fichário de pesquisa" já usada
// em LexicalCard. Desenhada em SVG inline (sem imagem externa, sem nova
// dependência) usando só a paleta existente do projeto.
function EstudoBotanico() {
  return (
    <div className="border border-line rounded-sm bg-card p-8 aspect-[3/4] flex flex-col">
      <svg viewBox="0 0 200 260" className="flex-1 w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M100 235 C100 235 96 150 100 90 C104 40 100 15 100 15"
          stroke="#3E4A24"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path
          d="M100 200 C70 190 48 165 42 128 C68 130 92 148 100 178"
          fill="#8A9A5B"
          fillOpacity="0.16"
          stroke="#5C6B37"
          strokeWidth="1.3"
        />
        <path d="M55 138 C68 148 84 162 96 178" stroke="#5C6B37" strokeWidth="0.8" strokeOpacity="0.6" />
        <path
          d="M100 165 C130 152 150 124 154 88 C128 94 106 116 99 148"
          fill="#8A9A5B"
          fillOpacity="0.16"
          stroke="#5C6B37"
          strokeWidth="1.3"
        />
        <path d="M144 100 C130 112 114 128 102 148" stroke="#5C6B37" strokeWidth="0.8" strokeOpacity="0.6" />
        <path
          d="M100 130 C76 118 58 92 54 58 C80 64 100 84 105 112"
          fill="#8A9A5B"
          fillOpacity="0.2"
          stroke="#5C6B37"
          strokeWidth="1.3"
        />
        <path d="M62 70 C74 82 88 98 100 116" stroke="#5C6B37" strokeWidth="0.8" strokeOpacity="0.6" />
        <path
          d="M100 96 C124 82 140 58 142 30 C118 38 102 56 98 80"
          fill="#8A9A5B"
          fillOpacity="0.2"
          stroke="#5C6B37"
          strokeWidth="1.3"
        />
        <path d="M134 42 C122 52 110 66 100 80" stroke="#5C6B37" strokeWidth="0.8" strokeOpacity="0.6" />
        <circle cx="100" cy="220" r="3.5" fill="#D4A72C" />
        <circle cx="88" cy="228" r="2.5" fill="#9C4A2A" fillOpacity="0.75" />
        <circle cx="112" cy="227" r="2.5" fill="#9C4A2A" fillOpacity="0.75" />
      </svg>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-moss/70 text-center mt-3">
        Estudo botânico · Itamira
      </p>
    </div>
  );
}
