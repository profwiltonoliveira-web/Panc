import type { PapelUsuario } from "@/lib/types";

// Decide para onde mandar o usuário logo após o login, com base no papel
// consultado em `profiles` — nunca com base apenas na interface. Extraída
// como função pura (sem depender do Supabase nem do navegador) para poder
// ser testada isoladamente em src/lib/auth-redirect.test.ts.
//
// Regras:
// - administrador sem "next" (ou com "next" incompatível) vai para /admin;
// - pesquisador (ou qualquer papel que não seja administrador) nunca é
//   mandado para uma rota /admin, mesmo que o "next" peça isso;
// - um "next" só é respeitado se for um caminho local (começa com uma
//   única barra, nunca "//", o que evitaria um redirecionamento externo) e
//   compatível com o papel do usuário.
export function destinoPosLogin(papel: PapelUsuario | null | undefined, next: string | null | undefined): string {
  const destinoPadrao = papel === "administrador" ? "/admin" : "/pesquisador";

  if (!next) return destinoPadrao;
  if (!next.startsWith("/") || next.startsWith("//")) return destinoPadrao;
  if (next.startsWith("/admin") && papel !== "administrador") return destinoPadrao;

  return next;
}
