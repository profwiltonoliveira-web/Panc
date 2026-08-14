import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: {
    default: "PANCpedia — Dicionário Enciclopédico Digital das PANC de Itamira",
    template: "%s | PANCpedia"
  },
  description:
    "Dicionário Enciclopédico Digital das Plantas Alimentícias Não Convencionais de Itamira, Aporá — Bahia. Botânica, uso alimentar, saberes comunitários e patrimônio lexical.",
  openGraph: {
    type: "website",
    siteName: "PANCpedia",
    locale: "pt_BR"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
