import VerbeteForm from "@/components/VerbeteForm";

export default function NovoVerbetePage() {
  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12">
      <h1 className="font-display text-3xl text-ink mb-8">Novo verbete</h1>
      <VerbeteForm />
    </div>
  );
}
