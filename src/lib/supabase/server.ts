// Cliente Supabase para uso em Server Components, Route Handlers e Server Actions.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        // getAll/setAll (não get/set/remove, deprecated) — mesmo motivo do
        // middleware. setAll() só pode gravar cookies quando chamado a
        // partir de uma Server Action/Route Handler; chamado a partir de um
        // Server Component ele lança, e é seguro ignorar (o middleware já
        // cuida do refresh de sessão nesse caso).
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // ignorável — ver comentário acima
          }
        }
      }
    }
  );
}

// Cliente com privilégios de administrador (service role).
// NUNCA importar este arquivo em um componente de cliente ("use client").
// Use apenas em Route Handlers/Server Actions que já validaram papel = administrador.
export function createAdminClient() {
  const { createClient: createRawClient } = require("@supabase/supabase-js");
  return createRawClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
