import Link from "next/link";
import { UserX } from "lucide-react";

/**
 * Reached when the BFF 404s the dossier (no such user row) or 422s the id (not a
 * UUID). Both are the same thing to the person who pasted something into the URL
 * bar: there is nobody here. It is not an outage, and it does not pretend to be —
 * a failed FETCH renders the error shell in page.tsx instead.
 */
export default function UserNotFound() {
  return (
    <div className="flex h-[calc(100vh-64px)] w-full items-center justify-center px-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-tertiary)]">
          <UserX size={20} strokeWidth={1.5} />
        </span>

        <div>
          <h1 className="mb-2 font-display text-[20px] leading-tight text-[var(--text-primary)]">
            Jogador não encontrado
          </h1>
          <p className="text-[13px] font-300 leading-relaxed text-[var(--text-secondary)]">
            Não existe nenhuma conta com esse ID. Confira o UUID, ou procure a pessoa pelo nome com{" "}
            <kbd className="label-colus rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-[2px] text-[8px] text-[var(--text-tertiary)]">
              ⌘K
            </kbd>
            .
          </p>
        </div>

        <Link
          href="/"
          className="text-[12px] text-[var(--primary)] underline-offset-2 hover:underline"
        >
          Voltar aos painéis
        </Link>
      </div>
    </div>
  );
}
