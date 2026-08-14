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

export default async function HomePage() {
  const destaques = await buscarDestaques();

  return (
    <div>
      <section className="max-w-4xl mx-auto px-5 sm:px-8 pt-16 pb-14 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-moss mb-4">
          Itamira · Aporá · Bahia
        </p>
        <h1 className="font-display text-5xl sm:text-6xl font-semibold text-ink leading-[1.05]">
          PANCpedia
        </h1>
        <p className="font-body text-xl text-ink/80 mt-3">
          Dicionário Enciclopédico Digital das Plantas Alimentícias Não
          Convencionais de Itamira
        </p>
        <p className="font-sans text-ink/60 max-w-prose mx-auto mt-6 leading-relaxed">
          Um dicionário construído a partir da pesquisa, da observação do
          território e dos saberes compartilhados pela comunidade de Itamira.
        </p>

        <div className="mt-10 max-w-xl mx-auto">
          <SearchBar large />
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 font-sans text-sm">
          <Link href="/dicionario" className="text-ink/80 hover:text-clay">Explorar o dicionário</Link>
          <span className="text-line">·</span>
          <Link href="/mapa" className="text-ink/80 hover:text-clay">Mapa</Link>
          <span className="text-line">·</span>
          <Link href="/sobre" className="text-ink/80 hover:text-clay">Saberes de Itamira</Link>
          <span className="text-line">·</span>
          <Link href="/sobre" className="text-ink/80 hover:text-clay">Sobre o projeto</Link>
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
