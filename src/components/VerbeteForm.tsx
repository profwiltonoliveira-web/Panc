import { Plant } from "@/lib/types";

// Formulário de dados gerais + "A palavra em Itamira" de um verbete já
// criado. O envio chama diretamente uma Server Action (salvarVerbeteCompleto)
// que grava em `plants` e `linguistic_records` via Supabase, respeitando a
// RLS: o pesquisador só consegue gravar enquanto o verbete estiver em
// rascunho ou em revisão — depois de aprovado, a escrita é bloqueada pelo
// próprio banco (ver supabase/schema.sql).
export default function VerbeteForm({
  plant,
  action
}: {
  plant: Plant;
  action: (formData: FormData) => void;
}) {
  const registro = plant.registroLinguistico;
  const podeEditar = plant.status === "rascunho" || plant.status === "em_revisao";

  return (
    <form action={action} className="space-y-8 font-sans text-sm">
      <fieldset className="space-y-4" disabled={!podeEditar}>
        <legend className="font-display text-xl text-ink mb-2">Dados gerais</legend>
        <Campo name="nome_destaque" label="Nome de destaque do verbete" defaultValue={plant.nomeDestaque} required />
        <Campo name="nome_cientifico" label="Nome científico" defaultValue={plant.nomeCientifico} />
        <Campo name="descricao_curta" label="Descrição curta" defaultValue={plant.descricaoCurta} textarea required />
      </fieldset>

      <fieldset className="space-y-4" disabled={!podeEditar}>
        <legend className="font-display text-xl text-ink mb-2">Identificação botânica</legend>
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo name="familia" label="Família" defaultValue={plant.familia} />
          <Campo name="genero" label="Gênero" defaultValue={plant.genero} />
          <Campo name="especie" label="Espécie" defaultValue={plant.especie} />
          <Campo name="habitat" label="Hábitat" defaultValue={plant.habitat} />
        </div>
        <Campo name="ocorrencia" label="Ocorrência" defaultValue={plant.ocorrencia} />
        <Campo name="observacoes_botanicas" label="Observações botânicas" defaultValue={plant.observacoesBotanicas} textarea />
      </fieldset>

      <fieldset className="space-y-4" disabled={!podeEditar}>
        <legend className="font-display text-xl text-ink mb-2">Uso alimentar</legend>
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo name="parte_utilizada" label="Parte utilizada" defaultValue={plant.parteUtilizada} />
          <Campo name="forma_preparo" label="Forma de preparo" defaultValue={plant.formaPreparo} />
          <Campo name="forma_consumo" label="Forma de consumo" defaultValue={plant.formaConsumo} />
        </div>
        <Campo name="receitas" label="Receitas / preparações" defaultValue={plant.receitas} textarea />
        <Campo name="observacoes_uso" label="Observações de uso" defaultValue={plant.observacoesUso} textarea />
      </fieldset>

      <fieldset className="space-y-4 border border-moss/40 bg-card p-5 rounded-sm" disabled={!podeEditar}>
        <legend className="font-display text-xl text-ink mb-2 px-1">A palavra em Itamira</legend>
        <Campo name="nome_popular" label="Nome popular" defaultValue={registro?.nomePopular} required />
        <Campo
          name="variacoes"
          label="Variações (separadas por vírgula)"
          defaultValue={registro?.variacoes.join(", ")}
        />
        <Campo name="pronuncia" label="Pronúncia" defaultValue={registro?.pronuncia} />
        <Campo name="significado" label="Significado" defaultValue={registro?.significado} textarea />
        <Campo name="origem_nome" label="Origem do nome" defaultValue={registro?.origemNome} textarea />
        <Campo name="uso_linguistico" label="Uso linguístico" defaultValue={registro?.usoLinguistico} textarea />
        <Campo
          name="expressoes_relacionadas"
          label="Expressões relacionadas"
          defaultValue={registro?.expressoesRelacionadas}
          textarea
        />
        <Campo
          name="observacao_linguistica"
          label="Observação linguística (análise do pesquisador)"
          defaultValue={registro?.observacaoLinguistica}
          textarea
        />
        <Campo name="fonte_registro" label="Fonte do registro" defaultValue={registro?.fonteRegistro} required />

        <div className="pt-3 border-t border-moss/20 space-y-3">
          <label className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-moss">
            <input
              type="checkbox"
              name="etimologia_nao_determinada"
              defaultChecked={registro?.etimologia?.naoDeterminada ?? true}
            />
            Etimologia não determinada
          </label>
          <Campo name="etimologia_origem" label="Etimologia — origem" defaultValue={registro?.etimologia?.origem} />
          <Campo
            name="etimologia_lingua_origem"
            label="Etimologia — língua de origem"
            defaultValue={registro?.etimologia?.linguaOrigem}
          />
          <Campo
            name="etimologia_significado"
            label="Etimologia — significado"
            defaultValue={registro?.etimologia?.significado}
          />
          <Campo name="etimologia_fonte" label="Etimologia — fonte" defaultValue={registro?.etimologia?.fonte} />
          <Campo
            name="etimologia_observacoes"
            label="Etimologia — observações"
            defaultValue={registro?.etimologia?.observacoes}
            textarea
          />
        </div>
      </fieldset>

      {podeEditar ? (
        <button type="submit" className="bg-moss text-paper px-4 py-2 rounded-sm hover:bg-moss-dark">
          Salvar
        </button>
      ) : (
        <p className="text-xs font-mono text-ink/40 uppercase tracking-widest">
          Este verbete está {plant.status === "publicado" ? "publicado" : "aprovado"} — apenas o administrador
          pode alterá-lo agora.
        </p>
      )}
    </form>
  );
}

function Campo({
  name,
  label,
  defaultValue,
  textarea,
  required
}: {
  name: string;
  label: string;
  defaultValue?: string;
  textarea?: boolean;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-xs font-mono uppercase tracking-widest text-moss mb-1">
        {label} {required && <span className="text-clay">*</span>}
      </label>
      {textarea ? (
        <textarea
          id={name}
          name={name}
          defaultValue={defaultValue}
          rows={3}
          className="w-full border border-line rounded-sm px-3 py-2 bg-white focus:border-clay outline-none disabled:opacity-60"
        />
      ) : (
        <input
          id={name}
          name={name}
          defaultValue={defaultValue}
          required={required}
          className="w-full border border-line rounded-sm px-3 py-2 bg-white focus:border-clay outline-none disabled:opacity-60"
        />
      )}
    </div>
  );
}
