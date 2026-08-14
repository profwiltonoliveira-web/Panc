import { getPublishedDemoPlants } from "@/lib/demo-data";
import Link from "next/link";

export const metadata = { title: "Referências" };

export default function ReferenciasPage() {
  const referencias = getPublishedDemoPlants().flatMap((p) =>
    p.referencias.map((r) => ({ ...r, plantaSlug: p.slug, plantaNome: p.nomeDestaque }))
  );

  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 py-14">
      <h1 className="font-display text-4xl text-ink">Referências</h1>
      <p className="font-sans text-ink/60 mt-2 max-w-prose">
        Fontes bibliográficas, acadêmicas e de campo utilizadas na
        documentação dos verbetes do PANCpedia.
      </p>

      <ul className="mt-8 divide-y divide-line">
        {referencias.map((ref) => (
          <li key={ref.id} className="py-4 font-sans text-sm">
            <span className="tag-bibliografico">{ref.tipo.replace(/_/g, " ")}</span>
            <p className="text-ink/85 mt-1.5">
              {ref.titulo}
              {ref.ano && ` (${ref.ano})`}
            </p>
            <Link href={`/panc/${ref.plantaSlug}`} className="text-moss hover:text-clay text-xs">
              Citado em: {ref.plantaNome} →
            </Link>
          </li>
        ))}
      </ul>

      {referencias.length === 0 && (
        <p className="font-sans text-ink/50 italic mt-8">Nenhuma referência publicada ainda.</p>
      )}
    </div>
  );
}
