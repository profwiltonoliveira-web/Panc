// Middleware de autenticação/autorização.
// Garante que /pesquisador e /admin NUNCA sejam acessíveis apenas alterando a
// URL: a checagem de sessão e de papel acontece aqui, no servidor, antes de
// qualquer página ser renderizada — não apenas na interface do cliente.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
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

  if ((isPesquisadorRoute || isAdminRoute) && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (isAdminRoute && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("papel")
      .eq("id", user.id)
      .single();

    if (profile?.papel !== "administrador") {
      return NextResponse.redirect(new URL("/pesquisador", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/pesquisador/:path*", "/admin/:path*"]
};
