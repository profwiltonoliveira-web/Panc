import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PLANT_FULL_SELECT, PlantRow, mapPlantRow } from "@/lib/supabase/mappers";
import { comUrlAssinada } from "@/lib/supabase/photo-url";
import VerbeteForm from "@/components/VerbeteForm";
import {
  adicionarLocalizacao,
  adicionarReferencia,
  adicionarRegistroCampo,
  adicionarSaber,
  definirFotoPrincipal,
  enviarFoto,
  enviarParaRevisao,
  removerFoto,
  removerLocalizacao,
  removerReferencia,
  removerRegistroCampo,
  removerSaber,
  salvarVerbeteCompleto
} from "../actions";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  aprovado: "Aprovado",
  publicado: "Publicado"
};

const TIPOS_SABER = [
  ["uso_tradicional", "Uso tradicional"],
  ["forma_preparo", "Forma de preparo"],
  ["memoria", "Memória"],
  ["pratica", "Prática"],
  ["relato_campo", "Relato de campo"]
];

const TIPOS_REFERENCIA = [
  ["livro", "Livro"],
  ["artigo", "Artigo"],
  ["trabalho_academico", "Trabalho acadêmico"],
  ["site_institucional", "Site institucional"],
  ["catalogo", "Catálogo"],
  ["entrevista", "Entrevista"],
  ["registro_campo", "Registro de campo"],
  ["outro", "Outro"]
];

const TIPOS_LOCALIZACAO = [
  ["ocorrencia", "Ocorrência"],
  ["registro_campo", "Registro de campo"],
  ["observacao", "Observação"],
  ["outro", "Outro"]
];

async function buscarVerbeteDoPesquisador(id: string) {
  const supabase = createClient();
  const { data } = await supabase.from("plants").select(PLANT_FULL_SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  const plant = mapPlantRow(data as PlantRow);
  plant.fotos = await comUrlAssinada(plant.fotos);
  return plant;
}

export default async function EditarVerbetePage({ params }: { params: { id: string } }) {
  const verbete = await buscarVerbeteDoPesquisador(params.id);
  if (!verbete) notFound();

  const ultimaDevolucao =
    verbete.status === "rascunho"
      ? verbete.revisoes.find((r) => r.statusAnterior === "em_revisao" && r.statusNovo === "rascunho")
      : undefined;

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12 space-y-14">
      <header>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display text-3xl text-ink">{verbete.nomeDestaque}</h1>
          <span className="font-mono text-[11px] uppercase tracking-widest text-moss border border-moss/40 px-2 py-0.5 rounded-sm">
            {STATUS_LABEL[verbete.status]}
          </span>
        </div>

        {ultimaDevolucao && (
          <div className="mt-4 border border-clay/40 bg-clay/5 rounded-sm p-4">
            <p className="font-mono text-[11px] uppercase tracking-widest text-clay mb-1">
              Devolvido para correção
            </p>
            <p className="font-sans text-sm text-ink/80">
              {ultimaDevolucao.comentario ?? "Nenhuma justificativa registrada."}
            </p>
          </div>
        )}

        {verbete.status === "rascunho" && (
          <form action={enviarParaRevisao.bind(null, verbete.id)} className="mt-4">
            <button
              type="submit"
              className="font-sans text-sm bg-moss text-paper px-4 py-2 rounded-sm hover:bg-moss-dark"
            >
              Enviar para revisão
            </button>
          </form>
        )}
      </header>

      <section>
        <VerbeteForm plant={verbete} action={salvarVerbeteCompleto.bind(null, verbete.id)} />
      </section>

      {/* FOTOGRAFIAS */}
      <section className="border-t border-line pt-10">
        <h2 className="font-display text-xl text-ink mb-4">Fotografias</h2>

        {verbete.fotos.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            {verbete.fotos.map((foto) => (
              <div key={foto.id} className="border border-line rounded-sm overflow-hidden bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={foto.url} alt={foto.legenda ?? verbete.nomeDestaque} className="w-full aspect-video object-cover" />
                <div className="p-3 space-y-2">
                  <p className="font-sans text-xs text-ink/70">
                    {foto.legenda ?? "Sem legenda"}
                    {foto.principal && <span className="ml-2 tag-registro">Principal</span>}
                  </p>
                  <div className="flex gap-3 font-mono text-[11px] uppercase tracking-widest">
                    {!foto.principal && (
                      <form action={definirFotoPrincipal.bind(null, verbete.id, foto.id)}>
                        <button type="submit" className="text-moss hover:text-clay">
                          Tornar principal
                        </button>
                      </form>
                    )}
                    <form action={removerFoto.bind(null, verbete.id, foto.id)}>
                      <button type="submit" className="text-clay hover:opacity-70">
                        Remover
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <form
          action={enviarFoto.bind(null, verbete.id)}
          encType="multipart/form-data"
          className="space-y-3 font-sans text-sm border border-dashed border-line rounded-sm p-4"
        >
          <input type="file" name="arquivo" accept="image/*" required className="block w-full text-sm" />
          <div className="grid sm:grid-cols-2 gap-3">
            <input name="legenda" placeholder="Legenda" className="border border-line rounded-sm px-3 py-2" />
            <input name="autoria" placeholder="Autoria" className="border border-line rounded-sm px-3 py-2" />
            <input name="data" type="date" className="border border-line rounded-sm px-3 py-2" />
            <input name="local_registro" placeholder="Local do registro" className="border border-line rounded-sm px-3 py-2" />
          </div>
          <label className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-moss">
            <input type="checkbox" name="principal" />
            Definir como foto principal
          </label>
          <button type="submit" className="border border-ink/20 px-4 py-2 rounded-sm hover:border-clay hover:text-clay">
            Enviar fotografia
          </button>
        </form>
      </section>

      {/* SABERES DE ITAMIRA */}
      <section className="border-t border-line pt-10">
        <h2 className="font-display text-xl text-ink mb-4">Saberes de Itamira</h2>
        <ListaComRemocao
          itens={verbete.saberes.map((s) => ({
            id: s.id,
            titulo: TIPOS_SABER.find(([v]) => v === s.tipo)?.[1] ?? s.tipo,
            corpo: s.descricao,
            rodape: `Fonte: ${s.fonteCompativel} · ${s.registradoEm}`
          }))}
          plantId={verbete.id}
          removerAction={removerSaber}
        />
        <form action={adicionarSaber.bind(null, verbete.id)} className="space-y-3 font-sans text-sm mt-4">
          <textarea name="descricao" required placeholder="Descrição do saber" rows={2} className="w-full border border-line rounded-sm px-3 py-2" />
          <div className="grid sm:grid-cols-2 gap-3">
            <select name="tipo" required className="border border-line rounded-sm px-3 py-2 bg-white">
              {TIPOS_SABER.map(([valor, rotulo]) => (
                <option key={valor} value={valor}>{rotulo}</option>
              ))}
            </select>
            <input name="fonte_compativel" required placeholder="Fonte (identificação compatível com critérios éticos)" className="border border-line rounded-sm px-3 py-2" />
          </div>
          <input name="registrado_em" type="date" className="border border-line rounded-sm px-3 py-2" />
          <button type="submit" className="border border-ink/20 px-4 py-2 rounded-sm hover:border-clay hover:text-clay">
            Adicionar saber
          </button>
        </form>
      </section>

      {/* REFERÊNCIAS */}
      <section className="border-t border-line pt-10">
        <h2 className="font-display text-xl text-ink mb-4">Referências</h2>
        <ListaComRemocao
          itens={verbete.referencias.map((r) => ({
            id: r.id,
            titulo: r.titulo,
            corpo: `${TIPOS_REFERENCIA.find(([v]) => v === r.tipo)?.[1] ?? r.tipo}${r.ano ? ` · ${r.ano}` : ""}`,
            rodape: r.autor
          }))}
          plantId={verbete.id}
          removerAction={removerReferencia}
        />
        <form action={adicionarReferencia.bind(null, verbete.id)} className="space-y-3 font-sans text-sm mt-4">
          <input name="titulo" required placeholder="Título" className="w-full border border-line rounded-sm px-3 py-2" />
          <div className="grid sm:grid-cols-2 gap-3">
            <select name="tipo" required className="border border-line rounded-sm px-3 py-2 bg-white">
              {TIPOS_REFERENCIA.map(([valor, rotulo]) => (
                <option key={valor} value={valor}>{rotulo}</option>
              ))}
            </select>
            <input name="ano" placeholder="Ano" className="border border-line rounded-sm px-3 py-2" />
            <input name="autor" placeholder="Autor" className="border border-line rounded-sm px-3 py-2" />
            <input name="fonte" placeholder="Fonte" className="border border-line rounded-sm px-3 py-2" />
          </div>
          <input name="url" placeholder="URL (opcional)" className="w-full border border-line rounded-sm px-3 py-2" />
          <button type="submit" className="border border-ink/20 px-4 py-2 rounded-sm hover:border-clay hover:text-clay">
            Adicionar referência
          </button>
        </form>
      </section>

      {/* REGISTROS DE CAMPO */}
      <section className="border-t border-line pt-10">
        <h2 className="font-display text-xl text-ink mb-4">Registros de campo</h2>
        <ListaComRemocao
          itens={verbete.registrosCampo.map((r) => ({ id: r.id, titulo: r.data, corpo: r.descricao }))}
          plantId={verbete.id}
          removerAction={removerRegistroCampo}
        />
        <form action={adicionarRegistroCampo.bind(null, verbete.id)} className="space-y-3 font-sans text-sm mt-4">
          <textarea name="descricao" required placeholder="Observação de campo, visita ou coleta" rows={2} className="w-full border border-line rounded-sm px-3 py-2" />
          <input name="data" type="date" className="border border-line rounded-sm px-3 py-2" />
          <button type="submit" className="border border-ink/20 px-4 py-2 rounded-sm hover:border-clay hover:text-clay">
            Adicionar registro de campo
          </button>
        </form>
      </section>

      {/* LOCALIZAÇÕES */}
      <section className="border-t border-line pt-10">
        <h2 className="font-display text-xl text-ink mb-4">Localizações (mapa)</h2>
        <ListaComRemocao
          itens={verbete.localizacoes.map((l) => ({
            id: l.id,
            titulo: TIPOS_LOCALIZACAO.find(([v]) => v === l.tipo)?.[1] ?? l.tipo,
            corpo: `${l.latitude}, ${l.longitude}`,
            rodape: l.descricao
          }))}
          plantId={verbete.id}
          removerAction={removerLocalizacao}
        />
        <form action={adicionarLocalizacao.bind(null, verbete.id)} className="space-y-3 font-sans text-sm mt-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <input name="latitude" type="number" step="any" required placeholder="Latitude" className="border border-line rounded-sm px-3 py-2" />
            <input name="longitude" type="number" step="any" required placeholder="Longitude" className="border border-line rounded-sm px-3 py-2" />
          </div>
          <select name="tipo" required className="border border-line rounded-sm px-3 py-2 bg-white">
            {TIPOS_LOCALIZACAO.map(([valor, rotulo]) => (
              <option key={valor} value={valor}>{rotulo}</option>
            ))}
          </select>
          <input name="descricao" placeholder="Descrição (opcional)" className="w-full border border-line rounded-sm px-3 py-2" />
          <button type="submit" className="border border-ink/20 px-4 py-2 rounded-sm hover:border-clay hover:text-clay">
            Adicionar localização
          </button>
        </form>
      </section>

      {/* HISTÓRICO EDITORIAL */}
      {verbete.revisoes.length > 0 && (
        <section className="border-t border-line pt-10">
          <h2 className="font-display text-xl text-ink mb-4">Histórico editorial</h2>
          <ul className="space-y-2 font-sans text-xs text-ink/60">
            {verbete.revisoes.map((r) => (
              <li key={r.id} className="border-l-2 border-line pl-3">
                {STATUS_LABEL[r.statusAnterior]} → {STATUS_LABEL[r.statusNovo]}
                {r.revisorNome && ` · ${r.revisorNome}`} ·{" "}
                {new Date(r.criadoEm).toLocaleString("pt-BR")}
                {r.comentario && <p className="text-ink/80 mt-1">{r.comentario}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ListaComRemocao({
  itens,
  plantId,
  removerAction
}: {
  itens: { id: string; titulo: string; corpo?: string; rodape?: string }[];
  plantId: string;
  removerAction: (plantId: string, id: string) => void;
}) {
  if (itens.length === 0) {
    return <p className="font-sans text-sm text-ink/50 italic">Nenhum registro ainda.</p>;
  }
  return (
    <ul className="space-y-3">
      {itens.map((item) => (
        <li key={item.id} className="border border-line rounded-sm p-3 flex items-start justify-between gap-4">
          <div className="font-sans text-sm">
            <p className="text-ink">{item.titulo}</p>
            {item.corpo && <p className="text-ink/70 mt-0.5">{item.corpo}</p>}
            {item.rodape && <p className="text-ink/40 text-xs mt-0.5">{item.rodape}</p>}
          </div>
          <form action={removerAction.bind(null, plantId, item.id)}>
            <button type="submit" className="font-mono text-[11px] uppercase tracking-widest text-clay hover:opacity-70 whitespace-nowrap">
              Remover
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
