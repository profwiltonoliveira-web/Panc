import { RegistroLinguistico } from "@/lib/types";

// Elemento de assinatura do PANCpedia: a "ficha lexical" — uma referência visual
// aos antigos fichários de pesquisa linguística, usada para hospedar a seção
// "A palavra em Itamira" separada visualmente dos dados botânicos.
export default function LexicalCard({ registro }: { registro: RegistroLinguistico }) {
  return (
    <aside className="border border-moss/40 bg-card rounded-sm p-6 relative">
      <div className="absolute -top-3 left-6 bg-moss text-paper font-mono text-[10px] uppercase tracking-widest px-2 py-1">
        A palavra em Itamira
      </div>

      <div className="mt-3 space-y-5 font-sans text-sm text-ink/85">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-moss">Nome popular</p>
          <p className="font-display text-xl text-ink">{registro.nomePopular}</p>
        </div>

        {registro.pronuncia && (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-moss">Pronúncia</p>
            <p className="italic">{registro.pronuncia}</p>
          </div>
        )}

        {registro.variacoes.length > 0 && (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-moss">Variações</p>
            <ul className="list-disc list-inside">
              {registro.variacoes.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          </div>
        )}

        {registro.significado && (
          <div className="field-divider">
            <span className="tag-registro mb-1 inline-block">Dado registrado</span>
            <p className="font-mono text-[11px] uppercase tracking-widest text-moss">Significado</p>
            <p>{registro.significado}</p>
          </div>
        )}

        {registro.origemNome && (
          <div className="field-divider">
            <span className="tag-registro mb-1 inline-block">Dado registrado</span>
            <p className="font-mono text-[11px] uppercase tracking-widest text-moss">Origem do nome</p>
            <p>{registro.origemNome}</p>
          </div>
        )}

        {registro.usoLinguistico && (
          <div className="field-divider">
            <p className="font-mono text-[11px] uppercase tracking-widest text-moss">Contexto de uso</p>
            <p>{registro.usoLinguistico}</p>
          </div>
        )}

        {registro.expressoesRelacionadas && (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-moss">Expressões relacionadas</p>
            <p>{registro.expressoesRelacionadas}</p>
          </div>
        )}

        {registro.observacaoLinguistica && (
          <div className="field-divider">
            <span className="tag-analise mb-1 inline-block">Análise dos pesquisadores</span>
            <p className="font-mono text-[11px] uppercase tracking-widest text-clay">Observação linguística</p>
            <p>{registro.observacaoLinguistica}</p>
          </div>
        )}

        {registro.etimologia && (
          <div className="field-divider">
            <p className="font-mono text-[11px] uppercase tracking-widest text-moss">Etimologia</p>
            {registro.etimologia.naoDeterminada ? (
              <p className="italic text-ink/60">Etimologia não determinada.</p>
            ) : (
              <div className="space-y-1">
                {registro.etimologia.origem && <p>Origem: {registro.etimologia.origem}</p>}
                {registro.etimologia.linguaOrigem && <p>Língua de origem: {registro.etimologia.linguaOrigem}</p>}
                {registro.etimologia.significado && <p>Significado: {registro.etimologia.significado}</p>}
              </div>
            )}
          </div>
        )}

        <div className="field-divider">
          <span className="tag-bibliografico mb-1 inline-block">Fonte do registro</span>
          <p>{registro.fonteRegistro}</p>
        </div>
      </div>
    </aside>
  );
}
