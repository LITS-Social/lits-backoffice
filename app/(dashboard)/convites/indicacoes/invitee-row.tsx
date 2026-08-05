"use client";

import { useState, useTransition } from "react";
import { ShieldAlert, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Timestamp } from "@/components/ui/timestamp";
import { mgmStatusLabel, mgmStatusTone } from "../../_components/mgm";
import { setMgmInviteStatusAction } from "./actions";

type Invitee = {
  invite_id: string;
  user_id: string;
  name: string;
  status: string;
  accepted_at: string;
};

/**
 * Uma linha de indicado, com a ÚNICA escrita que este painel tem: marcar como
 * fraude e desfazer (ADR-0064 §8 — revisão humana antes do prêmio, que é manual
 * e pós-beta).
 *
 * O motivo é obrigatório porque ele é o entregável: o BFF grava o texto literal
 * em lits.ops_audit_log com o e-mail do operador e a transição, na mesma
 * transação da escrita. Por isso o botão abre um formulário em vez de agir no
 * clique — um "marcar fraude" de um toque só produziria ledger sem conteúdo.
 *
 * Não existe botão de "marcar como jogou". 'played' é derivado da janela da
 * reserva e quem escreve é a varredura do user-service; um botão desses seria
 * um botão de fabricar prêmio.
 *
 * RESSALVA DE LEITURA: a escrita vai para a primária e a lista é relida da
 * RÉPLICA (ListMgmReferrals usa h.db.Replica()). Com lag, a linha pode reaparecer
 * com o status antigo por um instante depois do revalidate. Repetir o clique não
 * estraga nada — o BFF trata "já está nesse status" como no-op e não escreve nem
 * linha nem auditoria.
 */
export function InviteeRow({ inv }: { inv: Invitee }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  const isFraud = inv.status === "fraudulent";
  const isDeclared = inv.status === "declared";

  function submit(status: "fraudulent" | "signed_up") {
    setError("");
    setNotice("");
    startTransition(async () => {
      const res = await setMgmInviteStatusAction(inv.invite_id, status, reason);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setReason("");
      // O apagamento do hash é irreversível e o operador só descobre DEPOIS —
      // dizer isso aqui é o que impede a próxima pergunta ("dá pra voltar?").
      if (res.phoneHashCleared) {
        setNotice(
          "Vaga declarada condenada: o identificador do telefone foi apagado e não volta. Para reabrir, o convidador precisa declarar o número de novo."
        );
      }
    });
  }

  return (
    <li className="border-t border-[var(--border)]/60 py-1.5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 truncate text-[12px] font-400 text-[var(--text-secondary)]">
          {inv.name}
        </span>
        <Badge variant={mgmStatusTone(inv.status)}>{mgmStatusLabel(inv.status)}</Badge>
        <Timestamp iso={inv.accepted_at} className="text-[11px] font-300" />
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className={
              isFraud
                ? "shrink-0 text-[10.5px] font-500 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
                : "shrink-0 text-[10.5px] font-500 text-[var(--color-error)] opacity-70 transition-opacity hover:opacity-100"
            }
          >
            {isFraud ? (
              <span className="inline-flex items-center gap-1">
                <Undo2 size={10} /> desfazer
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <ShieldAlert size={10} /> fraude
              </span>
            )}
          </button>
        )}
      </div>

      {notice && (
        <p className="mt-1.5 text-[10.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          {notice}
        </p>
      )}

      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5">
          <p className="text-[11px] font-300 leading-relaxed text-[var(--text-secondary)]">
            {isFraud
              ? "Desfazer a marcação devolve a linha a “entrou · falta jogar”. Se a partida tiver acontecido de verdade, a varredura horária volta a promovê-la para “jogou” sozinha."
              : isDeclared
                ? "Condenar uma vaga ainda reservada APAGA o identificador do telefone declarado — é irreversível. A vaga sai do teto de 3 do convidador na hora."
                : "A linha sai do teto de 3 do convidador e do prêmio na hora, e nenhuma varredura volta a promovê-la."}
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo (obrigatório — vai literal para o registro de auditoria)"
            rows={2}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[11.5px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
          {error && (
            <p className="rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error-bg)] px-2.5 py-1.5 text-[11px] text-[var(--color-error)]">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              disabled={pending || !reason.trim()}
              onClick={() => submit(isFraud ? "signed_up" : "fraudulent")}
              className="rounded-md bg-[var(--color-error)] px-2.5 py-1.5 text-[11px] font-600 text-white transition-opacity disabled:opacity-40"
            >
              {pending
                ? "Gravando…"
                : isFraud
                  ? "Confirmar reversão"
                  : "Confirmar marcação de fraude"}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setError("");
              }}
              className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
