"use client";

import { Suspense, useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { destinoPosLogin } from "@/lib/auth-redirect";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });

    if (error || !data.user) {
      setCarregando(false);
      setErro("E-mail ou senha inválidos.");
      return;
    }

    // Consulta o papel do próprio usuário recém-autenticado — usa a policy
    // "usuario le seu perfil" (auth.uid() = id) já existente, com a sessão
    // do próprio usuário. Nunca usa a service role para essa checagem.
    const { data: perfil } = await supabase.from("profiles").select("papel").eq("id", data.user.id).single();

    setCarregando(false);
    router.push(destinoPosLogin(perfil?.papel, searchParams.get("next")));
    router.refresh();
  }

  return (
    <div className="max-w-md mx-auto px-5 sm:px-8 py-20">
      <h1 className="font-display text-3xl text-ink">Entrar</h1>
      <p className="font-sans text-sm text-ink/60 mt-2">
        Acesso restrito a pesquisadores e à administração do PANCpedia.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4 font-sans">
        <div>
          <label htmlFor="email" className="block text-xs font-mono uppercase tracking-widest text-moss mb-1">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2.5 bg-white focus:border-clay outline-none"
          />
        </div>
        <div>
          <label htmlFor="senha" className="block text-xs font-mono uppercase tracking-widest text-moss mb-1">
            Senha
          </label>
          <input
            id="senha"
            type="password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2.5 bg-white focus:border-clay outline-none"
          />
        </div>

        {erro && <p className="text-clay text-sm">{erro}</p>}

        <button
          type="submit"
          disabled={carregando}
          className="w-full bg-moss text-paper py-2.5 rounded-sm hover:bg-moss-dark transition-colors disabled:opacity-50"
        >
          {carregando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
