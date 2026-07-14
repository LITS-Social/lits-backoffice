"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "light" | "dark";

/**
 * The theme lives on <html data-theme>, written before first paint by the
 * bootstrap script in the root layout. That element — not React — is the source
 * of truth, so this subscribes to it rather than keeping a second copy in state.
 *
 * The obvious version (useState + useEffect that calls setTheme on mount) reads
 * the DOM into state and triggers a cascading render on every mount; React 19's
 * linter flags it. useSyncExternalStore is what that pattern actually wanted:
 * one subscription to an external system, no duplicated state, no second render,
 * and no hydration mismatch — the server snapshot is "light" and React reconciles
 * to the real value after hydrating.
 */

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

// The server cannot know the visitor's theme; it renders the light-mode icon and
// React swaps it on hydration if the bootstrap script already chose dark.
function getServerSnapshot(): Theme {
  return "light";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("lits-theme", next);
  }, [theme]);

  const label = theme === "dark" ? "Modo claro" : "Modo escuro";

  return (
    <button
      onClick={toggle}
      title={label}
      aria-label={label}
      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
    >
      {theme === "dark" ? (
        <Sun size={12} strokeWidth={1.75} />
      ) : (
        <Moon size={12} strokeWidth={1.75} />
      )}
    </button>
  );
}
