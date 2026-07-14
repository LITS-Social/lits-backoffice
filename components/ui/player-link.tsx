import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * A player's name, wherever it appears, as a way into their dossier.
 *
 * Every panel prints names it already has a `user_id` for (`OpsUserRef` is
 * `{ user_id, name }` in every list the BFF returns) — so every one of those
 * names can be a door. This is the component that opens it, and it is the only
 * thing that should ever wrap a player's name in an ops table.
 *
 * Deliberately quiet: it inherits the cell's type and adds an underline only on
 * hover. A table where forty names are painted link-blue is a table where the
 * eye lands on the names instead of on the red ✗ next to the one who has not
 * paid — the exact opposite of what these panels are for. The affordance shows
 * up when the cursor does.
 *
 * `stopPropagation` matters: DataTable rows are themselves click targets (they
 * expand). Without it, clicking a name would both navigate AND toggle the row
 * open behind you.
 */
export function PlayerLink({
  userId,
  name,
  className,
}: {
  userId: string;
  name: string;
  className?: string;
}) {
  return (
    <Link
      href={`/usuarios/${userId}`}
      onClick={(e) => e.stopPropagation()}
      title={`Abrir dossiê de ${name}`}
      className={cn(
        "truncate rounded-sm underline-offset-2 transition-colors",
        "hover:text-[var(--primary)] hover:underline",
        "focus-visible:text-[var(--primary)] focus-visible:underline",
        className
      )}
    >
      {name}
    </Link>
  );
}
