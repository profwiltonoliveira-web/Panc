import { Metadata } from "next";
import SearchBar from "@/components/SearchBar";
import PlantCard from "@/components/PlantCard";
import { createClient } from "@/lib/supabase/server";
import { PLANT_PUBLIC_SELECT, PlantRow, mapPlantRow } from "@/lib/supabase/mappers";
import { comUrlAssinada } from "@/lib/supabase/photo-url";

export const metadata: Metadata = {
  title: "Dicionário",
  description: "Explore os verbetes das Plantas Alimentícias Não Convencionais de Itamira."
};

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

async function buscarVerbetesPublicados() {
  const supabase = createClient();
  const { data } = await supabase
    .from("plants")
    .select(PLANT_PUBLIC_SELECT)
    .eq("status", "publicado")
    .order("nome_destaque", { ascending: true });

  const plantas = ((data as PlantRow[] | null) ?? []).map(mapPlantRow);
  return Promise.all(
    plantas.map(async (planta) => ({ ...planta, fotos: await comUrlAssinada(planta.fotos) }))
  );
}

export default async function DicionarioPage() {
  const plantas = await buscarVerbetesPublicados();
  const letrasDisponiveis = new Set(plantas.map((p) => p.nomeDestaque[0]?.toUpperCase()));

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12">
      <h1 className="font-display text-4xl text-ink">Dicionário</h1>
      <p className="font-sans text-ink/60 mt-2 max-w-prose">
        Pesquise, ordene alfabeticamente e navegue pelos verbetes das PANC
        registradas em Itamira.
      </p>

      <div className="mt-6 max-w-xl">
        <SearchBar />
      </div>

      {/* Índice alfabético — referência ao índice de aba de um dicionário físico */}
      <nav aria-label="Índice alfabético" className="mt-8 flex flex-wrap gap-1 font-mono text-xs">
        {LETRAS.map((letra) => {
          const disponivel = letrasDisponiveis.has(letra);
          return disponivel ? (
            <a
              key={letra}
              href={`#letra-${letra}`}
              className="w-7 h-7 flex items-center justify-center border rounded-sm border-moss text-moss hover:bg-moss hover:text-paper cursor-pointer"
            >
              {letra}
            </a>
          ) : (
            <span
              key={letra}
              className="w-7 h-7 flex items-center justify-center border rounded-sm border-line text-ink/25"
            >
              {letra}
            </span>
          );
        })}
      </nav>

      <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {plantas.map((plant, indice) => {
          const letra = plant.nomeDestaque[0]?.toUpperCase();
          const primeiraDaLetra = plantas.findIndex((p) => p.nomeDestaque[0]?.toUpperCase() === letra) === indice;
          return (
            <div key={plant.id} id={primeiraDaLetra ? `letra-${letra}` : undefined} className="scroll-mt-24">
              <PlantCard plant={plant} />
            </div>
          );
        })}
      </div>

      {plantas.length === 0 && (
        <p className="font-sans text-ink/50 mt-10">
          Nenhum verbete publicado ainda. Assim que a revisão editorial aprovar
          novos verbetes, eles aparecerão aqui.
        </p>
      )}
    </div>
  );
}
