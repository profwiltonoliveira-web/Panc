import { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PLANT_PUBLIC_SELECT, PlantRow, mapPlantRow } from "@/lib/supabase/mappers";
import { comUrlAssinada } from "@/lib/supabase/photo-url";
import LexicalCard from "@/components/LexicalCard";

type Props = { params: { slug: string } };

// A área pública só pode mostrar verbetes com status = 'publicado'. O filtro
// abaixo é redundante com a policy de RLS "verbetes publicados sao publicos"
// de propósito: mesmo que um bug futuro remova esse .eq(), a RLS no banco
// ainda bloqueia o acesso a rascunhos, verbetes em revisão ou aprovados.
async function buscarVerbetePublicado(slug: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("plants")
    .select(PLANT_PUBLIC_SELECT)
    .eq("slug", slug)
    .eq("status", "publicado")
    .maybeSingle();

  if (!data) return null;
  const plant = mapPlantRow(data as PlantRow);
  plant.fotos = await comUrlAssinada(plant.fotos);
  return plant;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const plant = await buscarVerbetePublicado(params.slug);
  if (!plant) return {};
  return {
    title: plant.nomeDestaque,
    description: plant.descricaoCurta,
    alternates: { canonical: `/panc/${plant.slug}` },
    openGraph: {
      title: `${plant.nomeDestaque} — PANCpedia`,
      description: plant.descricaoCurta,
      type: "article"
    }
  };
}

export default async function VerbetePage({ params }: Props) {
  const plant = await buscarVerbetePublicado(params.slug);
  if (!plant) notFound();

  const fotoPrincipal = plant.fotos.find((f) => f.principal) ?? plant.fotos[0];

  return (
    <article className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
      {plant.demonstracao && (
        <div className="demo-banner text-paper font-mono text-[11px] uppercase tracking-widest px-3 py-1.5 mb-6 inline-block">
          Dado de demonstração — não publicar
        </div>
      )}

      <header className="border-b border-line pb-6">
        <h1 className="font-display text-5xl text-ink">{plant.nomeDestaque}</h1>
        <div className="mt-2 font-sans text-sm text-ink/70 space-x-4">
          {plant.nomeCientifico && <span className="italic">{plant.nomeCientifico}</span>}
          {plant.familia && <span>Família: {plant.familia}</span>}
        </div>
      </header>

      <div className="grid lg:grid-cols-[2fr_1fr] gap-10 mt-10">
        <div className="space-y-12">
          {/* FOTOGRAFIA */}
          <section>
            <div className="aspect-video bg-card rounded-sm overflow-hidden border border-line">
              {fotoPrincipal ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fotoPrincipal.url} alt={fotoPrincipal.legenda ?? plant.nomeDestaque} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-mono text-xs text-ink/30">
                  sem fotografia principal
                </div>
              )}
            </div>
            {fotoPrincipal?.legenda && (
              <p className="font-sans text-xs text-ink/50 mt-2">
                {fotoPrincipal.legenda}
                {fotoPrincipal.autoria && ` — ${fotoPrincipal.autoria}`}
                {fotoPrincipal.data && `, ${fotoPrincipal.data}`}
                {fotoPrincipal.localRegistro && ` (${fotoPrincipal.localRegistro})`}
              </p>
            )}
          </section>

          {/* IDENTIFICAÇÃO BOTÂNICA */}
          <section>
            <h2 className="font-display text-2xl text-ink border-b border-moss/30 pb-2">Identificação botânica</h2>
            <dl className="mt-4 grid sm:grid-cols-2 gap-x-8 gap-y-3 font-sans text-sm">
              <Campo label="Gênero" valor={plant.genero} />
              <Campo label="Espécie" valor={plant.especie} />
              <Campo label="Hábitat" valor={plant.habitat} />
              <Campo label="Ocorrência" valor={plant.ocorrencia} />
            </dl>
            {plant.observacoesBotanicas && (
              <p className="font-sans text-sm text-ink/70 mt-4">{plant.observacoesBotanicas}</p>
            )}
          </section>

          {/* USO ALIMENTAR */}
          <section>
            <h2 className="font-display text-2xl text-ink border-b border-moss/30 pb-2">Uso alimentar</h2>
            <dl className="mt-4 grid sm:grid-cols-2 gap-x-8 gap-y-3 font-sans text-sm">
              <Campo label="Parte utilizada" valor={plant.parteUtilizada} />
              <Campo label="Forma de preparo" valor={plant.formaPreparo} />
              <Campo label="Forma de consumo" valor={plant.formaConsumo} />
            </dl>
            {plant.receitas && <p className="font-sans text-sm text-ink/70 mt-4">{plant.receitas}</p>}
          </section>

          {/* SABERES DE ITAMIRA */}
          <section>
            <h2 className="font-display text-2xl text-ink border-b border-moss/30 pb-2">Saberes de Itamira</h2>
            {plant.saberes.length > 0 ? (
              <ul className="mt-4 space-y-4">
                {plant.saberes.map((saber) => (
                  <li key={saber.id} className="border-l-2 border-dende pl-4">
                    <span className="tag-registro">Dado registrado</span>
                    <p className="font-sans text-sm text-ink/80 mt-1.5">{saber.descricao}</p>
                    <p className="font-mono text-[11px] text-ink/40 mt-1">
                      Fonte: {saber.fonteCompativel} · {saber.registradoEm}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-sans text-sm text-ink/50 mt-4 italic">
                Nenhum saber comunitário registrado para este verbete ainda.
              </p>
            )}
          </section>

          {/* REFERÊNCIAS */}
          <section>
            <h2 className="font-display text-2xl text-ink border-b border-moss/30 pb-2">Referências</h2>
            {plant.referencias.length > 0 ? (
              <ul className="mt-4 space-y-2 font-sans text-sm text-ink/75">
                {plant.referencias.map((ref) => (
                  <li key={ref.id} className="flex gap-2">
                    <span className="tag-bibliografico shrink-0">{ref.tipo.replace(/_/g, " ")}</span>
                    <span>
                      {ref.titulo}
                      {ref.ano && ` (${ref.ano})`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-sans text-sm text-ink/50 mt-4 italic">Nenhuma referência cadastrada.</p>
            )}
          </section>
        </div>

        {/* A PALAVRA EM ITAMIRA — elemento de assinatura */}
        <div>
          {plant.registroLinguistico ? (
            <div className="sticky top-24">
              <LexicalCard registro={plant.registroLinguistico} />
            </div>
          ) : (
            <p className="font-sans text-sm text-ink/50 italic border border-line rounded-sm p-6">
              Registro linguístico ainda não cadastrado para este verbete.
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function Campo({ label, valor }: { label: string; valor?: string }) {
  if (!valor) return null;
  return (
    <div>
      <dt className="font-mono text-[11px] uppercase tracking-widest text-moss">{label}</dt>
      <dd className="text-ink/80">{valor}</dd>
    </div>
  );
}
