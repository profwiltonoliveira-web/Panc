// Middleware de autenticação/autorização.
// Garante que /pesquisador e /admin NUNCA sejam acessíveis apenas alterando a
// URL: a checagem de sessão e de papel acontece aqui, no servidor, antes de
// qualquer página ser renderizada — não apenas na interface do cliente.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  // Reatribuído dentro de setAll() sempre que o Supabase precisa gravar
  // cookies (ex.: refresh de sessão) — é esse objeto, e não um novo
  // NextResponse criado ad-hoc, que deve ser devolvido ao final, para que
  // o navegador receba os cookies atualizados.
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        // getAll/setAll (não get/set/remove, que a própria @supabase/ssr
        // marca como deprecated): o padrão antigo lida mal com sessões
        // cujo cookie é dividido em vários pedaços, causando exatamente o
        // sintoma observado (sessão reconhecida em uma rota, perdida na
        // seguinte). Ver diagnóstico anterior.
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPesquisadorRoute = path.startsWith("/pesquisador");
  const isAdminRoute = path.startsWith("/admin");

  // NextResponse.redirect(...) cria um objeto de resposta novo, separado do
  // `response` acima — sem isto, qualquer cookie gravado por setAll() (ex.:
  // um token renovado por getUser() um instante antes) seria descartado
  // sempre que a requisição termina em redirecionamento.
  function redirecionarPreservandoCookies(url: URL) {
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  if ((isPesquisadorRoute || isAdminRoute) && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", path);
    return redirecionarPreservandoCookies(redirectUrl);
  }

  if (isAdminRoute && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("papel")
      .eq("id", user.id)
      .single();

    if (profile?.papel !== "administrador") {
      return redirecionarPreservandoCookies(new URL("/pesquisador", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/pesquisador/:path*", "/admin/:path*"]
};
