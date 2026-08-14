import { notFound } from "next/navigation";
import { DEMO_PLANTS } from "@/lib/demo-data";
import VerbeteForm from "@/components/VerbeteForm";

export default function EditarVerbetePage({ params }: { params: { id: string } }) {
  const verbete = DEMO_PLANTS.find((p) => p.id === params.id);
  if (!verbete) notFound();

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12">
      <h1 className="font-display text-3xl text-ink mb-1">Editar verbete</h1>
      <p className="font-sans text-sm text-ink/50 mb-8">{verbete.nomeDestaque}</p>
      <VerbeteForm verbete={verbete} />
    </div>
  );
}
