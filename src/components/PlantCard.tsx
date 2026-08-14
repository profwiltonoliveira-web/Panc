import Link from "next/link";
import { Plant } from "@/lib/types";

export default function PlantCard({ plant }: { plant: Plant }) {
  const fotoPrincipal = plant.fotos.find((f) => f.principal) ?? plant.fotos[0];

  return (
    <Link
      href={`/panc/${plant.slug}`}
      className="group block bg-white border border-line rounded-sm overflow-hidden hover:border-clay transition-colors"
    >
      <div className="aspect-[4/3] bg-card overflow-hidden">
        {fotoPrincipal ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fotoPrincipal.url}
            alt={fotoPrincipal.legenda ?? plant.nomeDestaque}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center font-mono text-xs text-ink/30">
            sem fotografia
          </div>
        )}
      </div>
      <div className="p-4">
        <p className="font-display text-lg text-ink">{plant.nomeDestaque}</p>
        {plant.nomeCientifico && (
          <p className="font-body italic text-sm text-ink/60">{plant.nomeCientifico}</p>
        )}
        <p className="font-sans text-sm text-ink/70 mt-2 line-clamp-2">{plant.descricaoCurta}</p>
        <span className="inline-block mt-3 font-mono text-[11px] uppercase tracking-widest text-clay">
          Ver verbete →
        </span>
      </div>
    </Link>
  );
}
