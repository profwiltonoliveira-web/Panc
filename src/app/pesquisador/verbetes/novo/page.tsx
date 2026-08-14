import { criarVerbete } from "../actions";

export default function NovoVerbetePage() {
  return (
    <div className="max-w-2xl mx-auto px-5 sm:px-8 py-12">
      <h1 className="font-display text-3xl text-ink mb-2">Novo verbete</h1>
      <p className="font-sans text-sm text-ink/60 mb-8">
        Comece com o essencial — depois de criado, você poderá completar
        identificação botânica, uso alimentar, a palavra em Itamira, saberes,
        referências, registros de campo, localizações e fotografias.
      </p>

      <form action={criarVerbete} className="space-y-5 font-sans text-sm">
        <div>
          <label htmlFor="nome_destaque" className="block text-xs font-mono uppercase tracking-widest text-moss mb-1">
            Nome de destaque do verbete <span className="text-clay">*</span>
          </label>
          <input
            id="nome_destaque"
            name="nome_destaque"
            required
            className="w-full border border-line rounded-sm px-3 py-2.5 bg-white focus:border-clay outline-none"
          />
        </div>

        <div>
          <label htmlFor="nome_cientifico" className="block text-xs font-mono uppercase tracking-widest text-moss mb-1">
            Nome científico
          </label>
          <input
            id="nome_cientifico"
            name="nome_cientifico"
            className="w-full border border-line rounded-sm px-3 py-2.5 bg-white focus:border-clay outline-none"
          />
        </div>

        <div>
          <label htmlFor="descricao_curta" className="block text-xs font-mono uppercase tracking-widest text-moss mb-1">
            Descrição curta <span className="text-clay">*</span>
          </label>
          <textarea
            id="descricao_curta"
            name="descricao_curta"
            required
            rows={3}
            className="w-full border border-line rounded-sm px-3 py-2 bg-white focus:border-clay outline-none"
          />
        </div>

        <button
          type="submit"
          className="bg-moss text-paper px-4 py-2 rounded-sm hover:bg-moss-dark"
        >
          Criar rascunho
        </button>
      </form>
    </div>
  );
}
