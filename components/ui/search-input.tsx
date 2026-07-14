"use client";

import { Search, X } from "lucide-react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** Instant free-text filter box — no submit button, filters as you type. */
export function SearchInput({ value, onChange, placeholder }: SearchInputProps) {
  return (
    <div className="group relative">
      <Search
        size={13}
        strokeWidth={1.75}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] transition-colors group-focus-within:text-[var(--primary)]"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Buscar..."}
        className="w-full rounded-full border border-[var(--border)] bg-[var(--bg)] py-[7px] pl-8 pr-8 text-[13px] text-[var(--text-primary)] transition-colors placeholder:font-300 placeholder:text-[var(--text-tertiary)] hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpar busca"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <X size={13} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
