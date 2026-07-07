import { CheckCircle2 } from "lucide-react";

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
      <CheckCircle2 size={32} className="text-[var(--color-success)]" />
      <p className="text-[14px] font-sans font-500 text-[var(--text-secondary)]">
        {message}
      </p>
    </div>
  );
}
