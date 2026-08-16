"use client";

import { useState, useTransition } from "react";
import { Ban, Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { cancelBookingAction } from "../_actions/cancel-booking";
import { formatCurrency } from "@/lib/utils";

/**
 * Cancelar uma reserva pela ops, com estorno integral.
 *
 * Compartilhado pelos painéis #10 (Reservas Pagas) e #06 (Pagamentos) — os dois
 * chamam o mesmo botão, e uma cópia por painel é como as duas telas passam a
 * divergir na regra de dinheiro.
 *
 * A confirmação é de DOIS passos de propósito: um clique abre o formulário e
 * exige o motivo por escrito; só o segundo dispara. Isto devolve dinheiro de
 * verdade para uma pessoa de verdade e cancela um jogo que alguém marcou — não
 * é o tipo de coisa que pode sair de um clique acidental numa tabela densa.
 *
 * NÃO usa window.confirm: diálogo nativo bloqueia a thread e não tem onde
 * digitar o motivo, que é obrigatório no contrato.
 */
export function CancelBookingButton({
  bookingId,
  priceLabel,
  disabled,
  disabledHint,
}: {
  bookingId: string;
  /** Valor exibido na confirmação, pra ops ver o que vai voltar antes de mandar. */
  priceLabel?: string;
  /** Estado terminal (já cancelada / jogada) — o servidor recusaria de qualquer forma. */
  disabled?: boolean;
  disabledHint?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const pathname = usePathname();

  if (disabled) {
    return (
      <span className="text-[10.5px] text-[var(--text-tertiary)]" title={disabledHint}>
        —
      </span>
    );
  }

  if (feito) {
    return <span className="text-[10.5px] text-[var(--text-secondary)]">{feito}</span>;
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[10.5px] text-[var(--text-secondary)] transition-colors hover:border-[var(--color-error)] hover:text-[var(--color-error)]"
      >
        <Ban size={11} strokeWidth={2} />
        Cancelar
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10.5px] leading-snug text-[var(--text-secondary)]">
        Cancela o jogo e <strong>devolve tudo</strong> a quem pagou
        {priceLabel ? ` (${priceLabel})` : ""}, mesmo fora da janela de reembolso.
      </p>
      <input
        autoFocus
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo (ex.: clube não tinha a quadra)"
        maxLength={280}
        className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--text-secondary)]"
      />
      {erro && <p className="text-[10.5px] text-[var(--color-error)]">{erro}</p>}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={pendente}
          onClick={() =>
            startTransition(async () => {
              setErro(null);
              const r = await cancelBookingAction({
                bookingId,
                reason: motivo,
                revalidate: pathname,
              });
              if (!r.ok) {
                setErro(r.error);
                return;
              }
              // O recibo diz quantas devoluções procurar no Mercado Pago —
              // numa partida dividida são DUAS cobranças distintas, e sem esse
              // número a ops procuraria uma só.
              const valor = r.refundedCents > 0 ? formatCurrency(r.refundedCents, r.currency) : "R$ 0";
              const pernas =
                r.refundedLegs === 0
                  ? "nada a estornar"
                  : `${r.refundedLegs} ${r.refundedLegs === 1 ? "devolução" : "devoluções"} no MP`;
              setFeito(`Cancelada · ${valor} · ${pernas}`);
            })
          }
          className="inline-flex items-center gap-1 rounded-md bg-[var(--color-error)] px-2 py-1 text-[10.5px] font-600 text-white disabled:opacity-60"
        >
          {pendente && <Loader2 size={11} className="animate-spin" />}
          {pendente ? "Cancelando..." : "Confirmar"}
        </button>
        <button
          type="button"
          disabled={pendente}
          onClick={() => {
            setAberto(false);
            setMotivo("");
            setErro(null);
          }}
          className="rounded-md px-2 py-1 text-[10.5px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
        >
          Voltar
        </button>
      </div>
    </div>
  );
}
