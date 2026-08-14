"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function SearchBar({ large = false }: { large?: boolean }) {
  const [value, setValue] = useState("");
  const router = useRouter();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    router.push(`/busca?q=${encodeURIComponent(value)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <label htmlFor="pancpedia-search" className="sr-only">
        Buscar uma planta, nome popular ou palavra
      </label>
      <div
        className={`flex items-center gap-3 bg-white border border-line rounded-sm px-4 ${
          large ? "py-4" : "py-2.5"
        } focus-within:border-clay transition-colors`}
      >
        <span aria-hidden className="text-moss">⌕</span>
        <input
          id="pancpedia-search"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Busque uma planta, um nome popular ou uma palavra..."
          className={`w-full bg-transparent outline-none font-body ${large ? "text-lg" : "text-base"} placeholder:text-ink/40`}
        />
        <button
          type="submit"
          className="font-mono text-[11px] uppercase tracking-widest text-moss border border-moss px-3 py-1.5 rounded-sm hover:bg-moss hover:text-paper transition-colors whitespace-nowrap"
        >
          Buscar
        </button>
      </div>
    </form>
  );
}
