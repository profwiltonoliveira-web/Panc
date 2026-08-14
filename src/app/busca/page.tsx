import SearchBar from "@/components/SearchBar";
import PlantCard from "@/components/PlantCard";
import { createClient } from "@/lib/supabase/server";
import { PLANT_PUBLIC_SELECT, PlantRow, mapPlantRow } from "@/lib/supabase/mappers";
import { comUrlAssinada } from "@/lib/supabase/photo-url";
import { Plant } from "@/lib/types";

export const metadata = { title: "Busca" };

// Busca real no Postgres, em duas etapas:
// 1) descobre quais verbetes publicados combinam com o termo — por nome,
//    nome científico, descrição curta (na própria tabela "plants") ou por
//    nome popular/variações registrados em "A palavra em Itamira"
//    (linguistic_records, em outra tabela);
// 2) busca os dados completos apenas desses verbetes, com uma única
//    consulta reaproveitando o mesmo select usado nas demais páginas.
// A correspondência parcial dentro do array "variacoes" é feita em memória
// sobre o resultado já filtrado por verbete publicado, porque o PostgREST
// não expõe "ilike" parcial dentro de colunas do tipo array.
async function buscarResultados(termo: string): Promise<Plant[]> {
  if (!termo) return [];
  const supabase = createClient();
  const padrao = `%${termo}%`;
  const termoBusca = termo.toLowerCase();

  const [porCampoDoVerbete, registrosLinguisticos] = await Promise.all([
    supabase
      .from("plants")
      .select("id")
      .eq("status", "publicado")
      .or(`nome_destaque.ilike.${padrao},nome_cientifico.ilike.${padrao},descricao_curta.ilike.${padrao}`),
    supabase
      .from("linguistic_records")
      .select("plant_id, nome_popular, variacoes, plants!inner ( status )")
      .eq("plants.status", "publicado")
  ]);

  const idsEncontrados = new Set<string>((porCampoDoVerbete.data ?? []).map((r) => r.id as string));

  for (const registro of (registrosLinguisticos.data ?? []) as {
    plant_id: string;
    nome_popular: string;
    variacoes: string[] | null;
  }[]) {
    const combina =
      registro.nome_popular?.toLowerCase().includes(termoBusca) ||
      (registro.variacoes ?? []).some((v) => v.toLowerCase().includes(termoBusca));
    if (combina) idsEncontrados.add(registro.plant_id);
  }

  if (idsEncontrados.size === 0) return [];

  const { data } = await supabase
    .from("plants")
    .select(PLANT_PUBLIC_SELECT)
    .eq("status", "publicado")
    .in("id", Array.from(idsEncontrados));

  const plantas = ((data as PlantRow[] | null) ?? []).map(mapPlantRow);
  return Promise.all(
    plantas.map(async (planta) => ({ ...planta, fotos: await comUrlAssinada(planta.fotos) }))
  );
}

export default async function BuscaPage({ searchParams }: { searchParams: { q?: string } }) {
  const termo = (searchParams.q ?? "").trim();
  const resultados = await buscarResultados(termo);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12">
      <h1 className="font-display text-4xl text-ink">Busca</h1>
      <div className="mt-6 max-w-xl">
        <SearchBar />
      </div>

      <p className="font-sans text-sm text-ink/60 mt-6">
        {termo
          ? `${resultados.length} resultado(s) para "${termo}"`
          : "Digite um termo para pesquisar no dicionário."}
      </p>

      <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {resultados.map((plant) => (
          <PlantCard key={plant.id} plant={plant} />
        ))}
      </div>

      {termo && resultados.length === 0 && (
        <p className="font-sans text-ink/50 mt-10 italic">
          Nenhum verbete encontrado. Tente um nome popular, científico ou uma
          palavra registrada em Itamira.
        </p>
      )}
    </div>
  );
}
