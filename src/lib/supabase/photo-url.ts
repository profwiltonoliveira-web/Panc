import { createClient } from "@/lib/supabase/server";
import { Foto } from "@/lib/types";

// O bucket "fotos-verbetes" é privado (ver supabase/schema.sql) — a URL
// pública direta não funciona. Trocamos o caminho salvo em plant_photos.url
// por uma URL assinada e temporária, gerada a cada requisição através do
// cliente autenticado (respeitando a RLS de storage.objects: só recebe URL
// quem tem permissão de ver aquele arquivo).
export async function comUrlAssinada(fotos: Foto[]): Promise<Foto[]> {
  if (fotos.length === 0) return fotos;

  const supabase = createClient();
  const caminhos = fotos.map((f) => f.url);
  const { data, error } = await supabase.storage.from("fotos-verbetes").createSignedUrls(caminhos, 3600);

  if (error || !data) return fotos;

  return fotos.map((foto, indice) => ({
    ...foto,
    url: data[indice]?.signedUrl ?? foto.url
  }));
}
