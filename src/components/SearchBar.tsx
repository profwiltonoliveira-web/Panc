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
        className={`flex items-center bg-white border border-line rounded-sm pl-3.5 sm:pl-4 pr-1.5 py-2.5 gap-2 sm:gap-3 focus-within:border-clay transition-colors ${
          large ? "flex-wrap sm:flex-nowrap" : ""
        }`}
      >
        <span aria-hidden className={`text-moss shrink-0 ${large ? "hidden sm:inline" : ""}`}>⌕</span>
        <input
          id="pancpedia-search"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Busque uma planta, um nome popular ou uma palavra..."
          className={`min-w-0 bg-transparent outline-none font-body placeholder:text-ink/40 ${
            large
              ? "basis-full sm:basis-0 sm:flex-1 sm:w-auto text-xs sm:text-base lg:text-lg"
              : "w-full text-base"
          }`}
        />
        <button
          type="submit"
          className={`shrink-0 font-mono text-[11px] uppercase tracking-widest text-paper bg-moss px-3.5 py-2 rounded-sm hover:bg-moss-dark transition-colors whitespace-nowrap ${
            large ? "ml-auto sm:ml-0" : ""
          }`}
        >
          Buscar
        </button>
      </div>
    </form>
  );
}
