// Em produção: SELECT * FROM profiles WHERE papel = 'pesquisador'
const PESQUISADORES_EXEMPLO = [
  { id: "demo-pesquisador-1", nome: "Pesquisador de demonstração", instituicao: "Escola de Itamira (exemplo)" }
];

export default function PesquisadoresPage() {
  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-12">
      <h1 className="font-display text-3xl text-ink">Pesquisadores</h1>
      <div className="mt-8 divide-y divide-line">
        {PESQUISADORES_EXEMPLO.map((p) => (
          <div key={p.id} className="py-4 font-sans text-sm flex items-center justify-between">
            <div>
              <p className="text-ink">{p.nome}</p>
              <p className="text-ink/50 text-xs">{p.instituicao}</p>
            </div>
            <span className="font-mono text-[11px] uppercase tracking-widest text-moss border border-moss/40 px-2 py-0.5 rounded-sm">
              Pesquisador
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
