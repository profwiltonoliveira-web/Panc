import { getPublishedDemoPlants } from "@/lib/demo-data";
import MapaCliente from "./MapaCliente";

export const metadata = { title: "Mapa de Itamira" };

export default function MapaPage() {
  const pontos = getPublishedDemoPlants().flatMap((p) =>
    p.localizacoes.map((loc) => ({ ...loc, nomePlanta: p.nomeDestaque, slug: p.slug }))
  );

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12">
      <h1 className="font-display text-4xl text-ink">Mapa de Itamira</h1>
      <p className="font-sans text-ink/60 mt-2 max-w-prose">
        Pontos associados a ocorrências de PANC e registros de campo. A
        localização pessoal de participantes da pesquisa nunca é exibida.
      </p>
      <div className="mt-8 border border-line rounded-sm overflow-hidden">
        <MapaCliente pontos={pontos} />
      </div>
    </div>
  );
}
