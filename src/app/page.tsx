import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import PlantCard from "@/components/PlantCard";
import { getPublishedDemoPlants } from "@/lib/demo-data";

export default function HomePage() {
  const destaques = getPublishedDemoPlants().slice(0, 3);

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
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {destaques.map((plant) => (
              <PlantCard key={plant.id} plant={plant} />
            ))}
          </div>
          <p className="mt-6 font-mono text-[11px] text-ink/40">
            Conteúdo de demonstração exibido durante o desenvolvimento — ver aviso em /sobre.
          </p>
        </div>
      </section>
    </div>
  );
}
