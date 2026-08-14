import { createClient } from "@/lib/supabase/server";
import MapaCliente from "./MapaCliente";

export const metadata = { title: "Mapa de Itamira" };

async function buscarPontosPublicados() {
  const supabase = createClient();
  const { data } = await supabase
    .from("locations")
    .select("id, latitude, longitude, tipo, descricao, plants!inner ( nome_destaque, slug, status )")
    .eq("plants.status", "publicado");

  return ((data ?? []) as unknown as {
    id: string;
    latitude: number;
    longitude: number;
    tipo: string;
    descricao: string | null;
    plants: { nome_destaque: string; slug: string };
  }[]).map((row) => ({
    id: row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    tipo: row.tipo,
    descricao: row.descricao ?? undefined,
    nomePlanta: row.plants.nome_destaque,
    slug: row.plants.slug
  }));
}

export default async function MapaPage() {
  const pontos = await buscarPontosPublicados();

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
      {pontos.length === 0 && (
        <p className="font-sans text-ink/50 mt-6 italic">
          Nenhuma localização publicada ainda.
        </p>
      )}
    </div>
  );
}
