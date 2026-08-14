import Link from "next/link";

const NAV = [
  { href: "/dicionario", label: "Dicionário" },
  { href: "/mapa", label: "Mapa" },
  { href: "/sobre", label: "Saberes de Itamira" },
  { href: "/referencias", label: "Referências" }
];

export default function Header() {
  return (
    <header className="border-b border-line bg-paper/95 backdrop-blur sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-baseline gap-2 group">
          <span className="font-display text-xl font-semibold tracking-tight text-ink">
            PANC<span className="text-moss">pedia</span>
          </span>
          <span className="hidden sm:inline font-mono text-[10px] uppercase tracking-widest text-moss/70">
            Itamira
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-7 font-sans text-sm text-ink/80">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-clay transition-colors">
              {item.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="ml-2 border border-ink/20 px-3 py-1.5 rounded-sm hover:border-clay hover:text-clay transition-colors"
          >
            Entrar
          </Link>
        </nav>
        <Link href="/busca" className="md:hidden font-sans text-sm border border-ink/20 px-3 py-1.5 rounded-sm">
          Buscar
        </Link>
      </div>
    </header>
  );
}
