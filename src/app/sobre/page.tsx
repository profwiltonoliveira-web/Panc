export const metadata = { title: "Sobre o projeto" };

export default function SobrePage() {
  return (
    <div className="max-w-prose mx-auto px-5 sm:px-8 py-14 font-sans text-ink/80 leading-relaxed">
      <h1 className="font-display text-4xl text-ink mb-6">Sobre o projeto</h1>

      <p>
        O PANCpedia é um dicionário enciclopédico digital dedicado às Plantas
        Alimentícias Não Convencionais (PANC) de Itamira, distrito de Aporá,
        Bahia. O projeto integra botânica, alimentação, território, cultura,
        memória, saberes comunitários e patrimônio lexical em um único
        conjunto de verbetes.
      </p>

      <p className="mt-4">
        Ele nasce como parte de uma iniciação científica escolar, e reúne o
        trabalho de pesquisadores que documentam, fotografam e registram
        informações linguísticas sobre as plantas encontradas no território de
        Itamira.
      </p>

      <h2 className="font-display text-2xl text-ink mt-10 mb-3">Saberes de Itamira</h2>
      <p>
        Cada verbete pode reunir usos tradicionais, formas de preparo,
        memórias e relatos obtidos durante a pesquisa de campo, sempre
        identificando a fonte do registro de maneira compatível com os
        critérios éticos do projeto. Informações sensíveis sobre moradores não
        são publicadas automaticamente.
      </p>

      <h2 className="font-display text-2xl text-ink mt-10 mb-3">Aviso sobre dados de demonstração</h2>
      <p>
        Durante o desenvolvimento, este site pode exibir registros fictícios,
        claramente identificados como <strong>“DADO DE DEMONSTRAÇÃO — NÃO
        PUBLICAR”</strong>. Nenhum nome de morador, entrevista, identificação
        botânica, etimologia, ocorrência ou dado de campo apresentado como
        exemplo deve ser tratado como informação real.
      </p>
    </div>
  );
}
