"use client";

import { useState } from "react";
import { Plant } from "@/lib/types";

// Formulário de edição/criação de verbete. Em produção, o submit chama uma
// Server Action / Route Handler que grava em `plants` (e tabelas relacionadas)
// via Supabase, sempre com status inicial "rascunho" — o pesquisador nunca
// publica diretamente (ver fluxo editorial no README).
export default function VerbeteForm({ verbete }: { verbete?: Partial<Plant> }) {
  const [salvo, setSalvo] = useState<string | null>(null);

  function handleSalvarRascunho() {
    setSalvo("Rascunho salvo.");
  }

  function handleEnviarRevisao() {
    setSalvo("Verbete enviado para revisão.");
  }

  return (
    <form className="space-y-8 font-sans text-sm" onSubmit={(e) => e.preventDefault()}>
      <fieldset className="space-y-4">
        <legend className="font-display text-xl text-ink mb-2">Dados gerais</legend>
        <Campo label="Nome de destaque do verbete" defaultValue={verbete?.nomeDestaque} required />
        <Campo label="Nome científico" defaultValue={verbete?.nomeCientifico} />
        <Campo label="Descrição curta" defaultValue={verbete?.descricaoCurta} textarea />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-display text-xl text-ink mb-2">Identificação botânica</legend>
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo label="Família" defaultValue={verbete?.familia} />
          <Campo label="Gênero" defaultValue={verbete?.genero} />
          <Campo label="Espécie" defaultValue={verbete?.especie} />
          <Campo label="Hábitat" defaultValue={verbete?.habitat} />
        </div>
        <Campo label="Observações botânicas" textarea />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-display text-xl text-ink mb-2">Uso alimentar</legend>
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo label="Parte utilizada" />
          <Campo label="Forma de preparo" />
          <Campo label="Forma de consumo" />
        </div>
        <Campo label="Receitas / preparações" textarea />
      </fieldset>

      <fieldset className="space-y-4 border border-moss/40 bg-card p-5 rounded-sm">
        <legend className="font-display text-xl text-ink mb-2 px-1">A palavra em Itamira</legend>
        <Campo label="Nome popular" />
        <Campo label="Variações (separadas por vírgula)" />
        <Campo label="Pronúncia" />
        <Campo label="Significado" textarea />
        <Campo label="Origem do nome" textarea />
        <Campo label="Uso linguístico" textarea />
        <Campo label="Expressões relacionadas" textarea />
        <Campo label="Observação linguística (análise do pesquisador)" textarea />
        <Campo label="Fonte do registro" required />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-display text-xl text-ink mb-2">Fotografias</legend>
        <input
          type="file"
          accept="image/*"
          multiple
          className="block w-full text-sm border border-dashed border-line rounded-sm p-4"
        />
        <p className="text-xs text-ink/50">
          Cada fotografia poderá receber legenda, autoria, data e local do registro após o envio.
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-line">
        <button
          type="button"
          onClick={handleSalvarRascunho}
          className="border border-ink/20 px-4 py-2 rounded-sm hover:border-clay hover:text-clay"
        >
          Salvar rascunho
        </button>
        <button
          type="button"
          onClick={handleEnviarRevisao}
          className="bg-moss text-paper px-4 py-2 rounded-sm hover:bg-moss-dark"
        >
          Enviar para revisão
        </button>
        {salvo && <span className="text-xs font-mono text-moss">{salvo}</span>}
      </div>
    </form>
  );
}

function Campo({
  label,
  defaultValue,
  textarea,
  required
}: {
  label: string;
  defaultValue?: string;
  textarea?: boolean;
  required?: boolean;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-mono uppercase tracking-widest text-moss mb-1">
        {label} {required && <span className="text-clay">*</span>}
      </label>
      {textarea ? (
        <textarea
          id={id}
          defaultValue={defaultValue}
          rows={3}
          className="w-full border border-line rounded-sm px-3 py-2 bg-white focus:border-clay outline-none"
        />
      ) : (
        <input
          id={id}
          defaultValue={defaultValue}
          className="w-full border border-line rounded-sm px-3 py-2 bg-white focus:border-clay outline-none"
        />
      )}
    </div>
  );
}
