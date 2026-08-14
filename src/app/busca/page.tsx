import SearchBar from "@/components/SearchBar";
import PlantCard from "@/components/PlantCard";
import { getPublishedDemoPlants } from "@/lib/demo-data";

export const metadata = { title: "Busca" };

export default function BuscaPage({ searchParams }: { searchParams: { q?: string } }) {
  const termo = (searchParams.q ?? "").trim().toLowerCase();

  // Em produção: consulta full-text no Supabase sobre nome popular, nome
  // científico, variações lexicais e descrição do verbete.
  const resultados = getPublishedDemoPlants().filter((p) => {
    if (!termo) return true;
    const alvo = [
      p.nomeDestaque,
      p.nomeCientifico ?? "",
      p.descricaoCurta,
      ...(p.registroLinguistico?.variacoes ?? [])
    ]
      .join(" ")
      .toLowerCase();
    return alvo.includes(termo);
  });

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12">
      <h1 className="font-display text-4xl text-ink">Busca</h1>
      <div className="mt-6 max-w-xl">
        <SearchBar />
      </div>

      <p className="font-sans text-sm text-ink/60 mt-6">
        {termo
          ? `${resultados.length} resultado(s) para "${searchParams.q}"`
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
