export const metadata = { title: "Mapa de Itamira" };

// Mapa territorial do PANCpedia: Google My Maps, mantido e editado pela
// equipe do projeto diretamente no Google My Maps (não é gerado a partir de
// consultas ao banco). A URL de incorporação fica em uma única variável de
// ambiente, em vez de espalhada pelo código.
const GOOGLE_MY_MAPS_EMBED_URL = process.env.NEXT_PUBLIC_GOOGLE_MY_MAPS_EMBED_URL;

export default function MapaPage() {
  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12">
      <h1 className="font-display text-4xl text-ink">Mapa de Itamira</h1>
      <p className="font-sans text-ink/60 mt-2 max-w-prose">
        Ocorrências de PANC e pontos de interesse do projeto no território de
        Itamira. A localização pessoal de participantes da pesquisa nunca é
        exibida.
      </p>

      <div className="mt-8 border border-line rounded-sm overflow-hidden">
        {GOOGLE_MY_MAPS_EMBED_URL ? (
          <iframe
            src={GOOGLE_MY_MAPS_EMBED_URL}
            title="Mapa de Itamira — Google My Maps"
            className="w-full"
            style={{ height: 480, border: 0 }}
            loading="lazy"
          />
        ) : (
          <div className="h-[480px] flex items-center justify-center bg-card px-8 text-center">
            <p className="font-sans text-sm text-ink/50 italic max-w-sm">
              Mapa ainda não configurado. Defina a variável de ambiente{" "}
              <code className="font-mono not-italic">NEXT_PUBLIC_GOOGLE_MY_MAPS_EMBED_URL</code>{" "}
              com a URL de incorporação do Google My Maps do projeto.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
