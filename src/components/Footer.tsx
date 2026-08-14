import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-line mt-24 bg-card">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12 grid gap-8 sm:grid-cols-3 font-sans text-sm text-ink/70">
        <div>
          <p className="font-display text-lg text-ink mb-2">PANCpedia</p>
          <p>
            Dicionário Enciclopédico Digital das Plantas Alimentícias Não Convencionais
            de Itamira, distrito de Aporá — Bahia.
          </p>
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-moss mb-3">Navegar</p>
          <ul className="space-y-1.5">
            <li><Link href="/dicionario" className="hover:text-clay">Dicionário</Link></li>
            <li><Link href="/mapa" className="hover:text-clay">Mapa de Itamira</Link></li>
            <li><Link href="/referencias" className="hover:text-clay">Referências</Link></li>
            <li><Link href="/sobre" className="hover:text-clay">Sobre o projeto</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-moss mb-3">Projeto</p>
          <p>
            Iniciação científica escolar desenvolvida em Itamira, Aporá — Bahia.
            Área do pesquisador disponível mediante autenticação.
          </p>
          <Link href="/login" className="inline-block mt-2 hover:text-clay">Acesso do pesquisador →</Link>
        </div>
      </div>
    </footer>
  );
}
