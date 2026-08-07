"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, Check, Trash2, X } from "lucide-react";
import {
  deleteFranchiseAction,
  previewFranchiseDeleteAction,
  type FranchiseDeleteFailure,
  type FranchiseDeleteReport,
} from "../actions";
import { updateFranchiseAction } from "../../quadras/[id]/editar/actions";

/**
 * Apagar a academia inteira — a única ação do painel que destrói a operação de
 * um clube de uma vez. Fica isolada aqui embaixo, fora do fluxo de edição.
 *
 * ── DOIS PASSOS, porque o endpoint tem dois ────────────────────────────────
 * DELETE /v1/ops/franchises/{id} sem corpo é uma PRÉVIA: o servidor conta tudo
 * sob os mesmos row locks da exclusão, não escreve nada e responde 200 com
 * `deleted:false`. Com `confirm_slug` + `reason` ele apaga e responde 200 com
 * `deleted:true`. Os DOIS ramos são 200 — `deleted` é o único sinal de escrita,
 * e ignorá-lo foi exatamente o bug que fazia o botão "apagar" navegar cantando
 * vitória com a academia intacta no banco.
 *
 * Este diálogo abre chamando a prévia e desenha OS NÚMEROS QUE ELA DEVOLVE. Não
 * há número inventado aqui: quadras, horários da grade, conectores, perfis que
 * perdem o clube favorito, públicos salvos, posts — e, em destaque, quantos
 * posts perdem o nome do lugar para sempre (os publicados antes de 31/07/2026,
 * que não têm `location_label` congelado).
 *
 * ── O QUE BLOQUEIA vs O QUE É DESVINCULADO ─────────────────────────────────
 * BLOQUEIA: reserva (bookings.club_id e bookings.court_id são RESTRICT) e
 * partida aberta (quick_matches.court_id é NOT NULL). O servidor recusa com 409
 * e NADA é apagado.
 * NÃO BLOQUEIA: clube favorito, sugestão de parceiro, público salvo e dica de
 * clube em convite — o handler LIMPA essas referências na mesma transação
 * (`UPDATE public.profiles SET preferred_club_id = NULL` e companhia). Dizer
 * que elas bloqueiam é pior que não dizer nada: o operador não confere o que
 * some em silêncio.
 *
 * ── O GUARD DO SLUG ────────────────────────────────────────────────────────
 * O servidor só apaga se `confirm_slug` bater com o slug da linha por trás do
 * {id}. O painel lista academia por id; um booleano apagaria alegremente aquela
 * para onde o id errado apontasse. Por isso existe um campo de texto de verdade
 * aqui — nada é pré-preenchido, e o que vai no request é o que o operador
 * digitou, nunca o slug que a tela já tinha.
 *
 * ── A SAÍDA QUANDO É RECUSADO ──────────────────────────────────────────────
 * franchises.kind='listing' faz o app parar de vender os horários da academia
 * (grade sintetizada, grátis, com o aviso de confirmar disponibilidade direto
 * com o clube) sem apagar quadra, reserva nem histórico. Foi o que a equipe fez
 * com as 23 venues junk em 21/07, e é o que quase sempre resolve.
 */

const fieldClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none";
const labelClass = "label-colus mb-1.5 block text-[8.5px] text-[var(--text-tertiary)]";

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function Num({ children }: { children: ReactNode }) {
  return <strong className="tabular-nums text-[var(--text-primary)]">{children}</strong>;
}

function Note({
  tone,
  icon,
  children,
}: {
  tone: "error" | "warning" | "success";
  icon: ReactNode;
  children: ReactNode;
}) {
  const cls =
    tone === "error"
      ? "border-[var(--color-error)]/25 bg-[var(--color-error-bg)] text-[var(--color-error)]"
      : tone === "warning"
        ? "border-[var(--color-clay)]/30 bg-[var(--color-warning-bg)] text-[var(--color-clay)]"
        : "border-[var(--color-success)]/25 bg-[var(--color-success-bg)] text-[var(--color-success)]";
  return (
    <p
      className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12px] leading-snug ${cls}`}
    >
      <span className="mt-px shrink-0">{icon}</span>
      <span>{children}</span>
    </p>
  );
}

export function DangerZone({
  franchiseId,
  franchiseName,
  franchiseKind,
  franchiseSlug,
  courtCount,
}: {
  franchiseId: string;
  franchiseName: string;
  franchiseKind: string;
  /** Slug conhecido pela PÁGINA (vem do diretório de franquias). Serve de
      contraprova contra o slug que a prévia devolve para este id — não é
      escrito no campo de confirmação. */
  franchiseSlug?: string;
  /** Quadras que a página já carregou. É só o texto de fora do diálogo; dentro
      dele quem manda são os números da prévia. */
  courtCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<FranchiseDeleteReport | null>(null);
  const [failure, setFailure] = useState<FranchiseDeleteFailure | null>(null);
  // Separado de `failure` de propósito: uma falha ao delistar não pode apagar o
  // 409 que colocou a alternativa na tela — sem isso o formulário de exclusão
  // reapareceria como se a academia tivesse deixado de estar bloqueada.
  const [delistError, setDelistError] = useState("");
  const [delisted, setDelisted] = useState(false);
  const [typedSlug, setTypedSlug] = useState("");
  const [reason, setReason] = useState("");

  const [loadingPreview, startPreview] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const [delisting, startDelisting] = useTransition();
  const busy = loadingPreview || deleting || delisting;

  const dialogRef = useRef<HTMLDivElement>(null);

  /* Quando o modal sobe, a tela vai PARA ele: o fundo trava (senão a página
     continua rolando atrás de um diálogo que pede confirmação digitada), o
     foco entra no diálogo e o Esc fecha. Sem isso o operador pode rolar para
     longe do modal e perder de vista o que está prestes a apagar. */
  useEffect(() => {
    if (!open) return;

    const { body } = document;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    body.style.overflow = "hidden";
    // Compensa a barra que some, senão o layout inteiro dá um salto lateral.
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    dialogRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
      window.removeEventListener("keydown", onKey);
    };
    // `closeModal` é estável o bastante: só lê `busy`, e o efeito rearma a cada
    // mudança dele — que é exatamente quando o Esc deve voltar a funcionar.
  }, [open, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  const alreadyListing = franchiseKind === "listing";
  const courtsLabel = plural(courtCount, "quadra", "quadras");

  // Bloqueado é o que a PRÉVIA contou, ou o que o servidor recontou ao recusar
  // o confirm (uma reserva pode nascer entre os dois passos — o handler lê as
  // contagens sob FOR UPDATE justamente por isso).
  const blocked = (preview?.blockers.total ?? 0) > 0 || failure?.blocked === true;
  const unavailable = failure?.unavailable === true;

  // As contagens do 409 mandam sobre as da prévia: o servidor recontou sob os
  // locks no momento da recusa. Sem 409, valem as da prévia.
  const blockerCounts = failure?.blockers
    ? failure.blockers
    : preview
      ? {
          bookingsOnVenue: preview.blockers.bookings_on_venue,
          bookingsOnCourts: preview.blockers.bookings_on_courts,
          quickMatches: preview.blockers.quick_matches,
        }
      : null;
  const blockerSum = blockerCounts
    ? blockerCounts.bookingsOnVenue + blockerCounts.bookingsOnCourts + blockerCounts.quickMatches
    : 0;
  // A frase do servidor só aparece quando NÃO há números para desenhar — com
  // números, o quadro de bloqueio abaixo já diz a mesma coisa melhor.
  const showFailureNote = failure !== null && (!failure.blocked || blockerSum === 0);

  // O que digitar: o slug que o SERVIDOR devolveu para este id. O da página
  // entra como contraprova (`drifted` abaixo), não como valor de confirmação.
  const expectedSlug = (preview?.slug ?? franchiseSlug ?? "").trim();
  const slugMatches =
    expectedSlug !== "" && typedSlug.trim().toLowerCase() === expectedSlug.toLowerCase();
  const drifted =
    preview !== null &&
    ((franchiseSlug !== undefined && franchiseSlug.toLowerCase() !== preview.slug.toLowerCase()) ||
      preview.name !== franchiseName);

  const canConfirm =
    preview !== null && !blocked && !unavailable && slugMatches && reason.trim() !== "" && !busy;
  const offerDelist = !alreadyListing && (blocked || unavailable);

  function loadPreview() {
    setFailure(null);
    startPreview(async () => {
      const res = await previewFranchiseDeleteAction(franchiseId);
      if (res.ok) setPreview(res.report);
      else setFailure(res);
    });
  }

  function openModal() {
    setPreview(null);
    setFailure(null);
    setDelistError("");
    setDelisted(false);
    setTypedSlug("");
    setReason("");
    setOpen(true);
    loadPreview();
  }

  function closeModal() {
    if (busy) return;
    setOpen(false);
  }

  function remove() {
    startDeleting(async () => {
      // Vai o que foi DIGITADO. Mandar `expectedSlug` faria o guard aprovar
      // sempre — quem compara com a linha real é o servidor.
      const res = await deleteFranchiseAction(franchiseId, {
        confirmSlug: typedSlug,
        reason,
      });
      if (res.ok) {
        // res.ok só é verdade com `deleted:true` no corpo (ver actions.ts).
        setOpen(false);
        // A academia não existe mais: sair da própria página antes que ela
        // tente se re-renderizar com um id morto. O revalidatePath da action já
        // derrubou o cache de /academias, então a lista volta sem ela.
        router.replace("/academias");
        router.refresh();
        return;
      }
      setFailure(res);
    });
  }

  function delist() {
    startDelisting(async () => {
      setDelistError("");
      const res = await updateFranchiseAction(franchiseId, { kind: "listing" });
      if (!res.ok) {
        setDelistError(res.error ?? "Falha ao transformar em Diretório.");
        return;
      }
      setDelisted(true);
      router.refresh();
    });
  }

  const cascade = preview?.cascade;
  const detached = preview?.detached;
  // O contrato declara `schemas` anulável (fatia nil do Go serializa como null).
  // Sem ela não dá para dizer em quantas cópias a academia vive — a frase que a
  // usa some, em vez de afirmar um número que não veio.
  const schemas = preview?.schemas ?? [];
  const hasDetached =
    detached !== undefined &&
    detached.profiles_preferred_club +
      detached.announcement_audiences +
      detached.partner_suggestions +
      detached.match_proposals +
      detached.posts >
      0;

  return (
    <section className="grain rounded-xl border border-[var(--color-error)]/25 bg-[var(--surface)] p-4 shadow-sm sm:p-6">
      <div className="mb-5">
        <h2 className="eyebrow text-[var(--color-error)]">Apagar academia</h2>
        <p className="mt-2 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          Remove a academia do banco e leva junto, em cascata, as <strong>{courtsLabel}</strong> dela
          e a grade de horários inteira. Não dá para desfazer. <strong>Reserva bloqueia</strong>: se
          existir qualquer reserva — ou partida aberta — o servidor recusa e nada é apagado; nesse
          caso a saída é transformar em Diretório. Abrir o diálogo consulta o servidor e mostra os
          números exatos antes de qualquer escrita.
        </p>
      </div>

      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-error)]/40 px-4 py-2 text-[12px] font-500 text-[var(--color-error)] transition-colors hover:bg-[var(--color-error-bg)]"
      >
        <Trash2 size={12} /> Apagar academia…
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
          onClick={closeModal}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-franchise-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="grain animate-fade-in-up max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl focus:outline-none"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 pt-6 pb-5">
              <div>
                <p className="eyebrow mb-2.5">Apagar academia</p>
                <h2
                  id="delete-franchise-title"
                  className="font-display text-[21px] leading-tight tracking-[-0.01em] text-[var(--text-primary)]"
                >
                  Apagar “{preview?.name ?? franchiseName}”?
                </h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Fechar"
                disabled={busy}
                className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                <X size={15} strokeWidth={2} />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              {delisted ? (
                <Note tone="success" icon={<Check size={13} strokeWidth={2.5} />}>
                  “{preview?.name ?? franchiseName}” agora é <strong>Diretório</strong>. O app parou
                  de vender os horários dela; quadras, reservas e histórico continuam intactos.
                </Note>
              ) : (
                <>
                  {loadingPreview && !preview && (
                    <p className="text-[12px] font-300 text-[var(--text-tertiary)]">
                      Consultando o servidor para contar o que vai junto… nada é escrito neste passo.
                    </p>
                  )}

                  {preview && drifted && (
                    <Note tone="warning" icon={<AlertTriangle size={13} />}>
                      A página mostra “{franchiseName}”
                      {franchiseSlug ? ` (${franchiseSlug})` : ""}, mas o servidor diz que este id é
                      “{preview.name}” ({preview.slug}). Recarregue a página antes de apagar
                      qualquer coisa.
                    </Note>
                  )}

                  {blocked && blockerCounts && blockerSum > 0 && (
                    <div className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-bg)] px-4 py-3.5">
                      <p className="text-[12.5px] font-600 text-[var(--color-error)]">
                        Não dá para apagar — e nada foi apagado
                      </p>
                      <ul className="mt-2 space-y-1 text-[12px] font-300 leading-relaxed text-[var(--color-error)]">
                        {blockerCounts.bookingsOnVenue > 0 && (
                          <li>
                            <Num>{blockerCounts.bookingsOnVenue}</Num>{" "}
                            {blockerCounts.bookingsOnVenue === 1 ? "reserva" : "reservas"} na
                            academia
                          </li>
                        )}
                        {blockerCounts.bookingsOnCourts > 0 && (
                          <li>
                            <Num>{blockerCounts.bookingsOnCourts}</Num>{" "}
                            {blockerCounts.bookingsOnCourts === 1 ? "reserva" : "reservas"} nas
                            quadras dela
                          </li>
                        )}
                        {blockerCounts.quickMatches > 0 && (
                          <li>
                            <Num>{blockerCounts.quickMatches}</Num>{" "}
                            {blockerCounts.quickMatches === 1
                              ? "partida aberta"
                              : "partidas abertas"}{" "}
                            nas quadras
                          </li>
                        )}
                      </ul>
                      <p className="mt-2 text-[11.5px] font-300 leading-relaxed text-[var(--color-error)]">
                        Reserva é registro de dinheiro e de jogo — nunca é apagada em cascata. O
                        servidor recusa e nada é escrito.
                      </p>
                    </div>
                  )}

                  {showFailureNote && failure && (
                    <Note tone="error" icon={<AlertCircle size={13} />}>
                      {failure.error}
                    </Note>
                  )}

                  {!preview && failure && (
                    <>
                      <p className="text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
                        Sem essa consulta o painel não sabe o que a exclusão levaria junto, então o
                        botão de apagar fica desligado.
                      </p>
                      <button
                        type="button"
                        onClick={loadPreview}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-4 py-2 text-[12px] font-500 text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50"
                      >
                        {loadingPreview ? "Consultando…" : "Tentar de novo"}
                      </button>
                    </>
                  )}

                  {preview && !blocked && cascade && detached && (
                    <>
                      <div>
                        <p className="label-colus mb-2 text-[8.5px] text-[var(--text-tertiary)]">
                          Vai junto, apagado sem outro aviso
                        </p>
                        <ul className="space-y-1.5 text-[12px] font-300 leading-relaxed text-[var(--text-secondary)]">
                          <li>
                            <Num>{cascade.courts}</Num> {cascade.courts === 1 ? "quadra" : "quadras"}{" "}
                            desta academia
                          </li>
                          <li>
                            <Num>{cascade.availability_slots}</Num>{" "}
                            {cascade.availability_slots === 1 ? "horário" : "horários"} de grade — a
                            agenda inteira das quadras
                          </li>
                          {cascade.data_source_connectors > 0 && (
                            <li>
                              <Num>{cascade.data_source_connectors}</Num>{" "}
                              {cascade.data_source_connectors === 1
                                ? "conector de importação"
                                : "conectores de importação"}{" "}
                              — o crawler desta academia para
                            </li>
                          )}
                        </ul>
                      </div>

                      <div>
                        <p className="label-colus mb-2 text-[8.5px] text-[var(--text-tertiary)]">
                          Fica no ar, mas perde o vínculo — não bloqueia nada
                        </p>
                        {hasDetached ? (
                          <ul className="space-y-1.5 text-[12px] font-300 leading-relaxed text-[var(--text-secondary)]">
                            {detached.profiles_preferred_club > 0 && (
                              <li>
                                <Num>{detached.profiles_preferred_club}</Num>{" "}
                                {detached.profiles_preferred_club === 1 ? "pessoa" : "pessoas"}{" "}
                                {detached.profiles_preferred_club === 1 ? "perde" : "perdem"} esta
                                academia como clube favorito — o servidor desvincula em silêncio,
                                sem avisar ninguém
                              </li>
                            )}
                            {detached.announcement_audiences > 0 && (
                              <li>
                                <Num>{detached.announcement_audiences}</Num>{" "}
                                {detached.announcement_audiences === 1
                                  ? "público salvo fica menor"
                                  : "públicos salvos ficam menores"}{" "}
                                — a academia sai da lista de clubes deles
                              </li>
                            )}
                            {detached.partner_suggestions > 0 && (
                              <li>
                                <Num>{detached.partner_suggestions}</Num>{" "}
                                {detached.partner_suggestions === 1 ? "sugestão" : "sugestões"} de
                                parceiro em cache{" "}
                                {detached.partner_suggestions === 1 ? "perde" : "perdem"} a dica de
                                clube (recalculadas em 24h)
                              </li>
                            )}
                            {detached.match_proposals > 0 && (
                              <li>
                                <Num>{detached.match_proposals}</Num>{" "}
                                {detached.match_proposals === 1
                                  ? "convite perde"
                                  : "convites perdem"}{" "}
                                a dica de clube
                              </li>
                            )}
                            {detached.posts > 0 && (
                              <li>
                                <Num>{detached.posts}</Num>{" "}
                                {detached.posts === 1
                                  ? "post do feed continua"
                                  : "posts do feed continuam"}{" "}
                                no ar, sem o vínculo com a academia
                              </li>
                            )}
                          </ul>
                        ) : (
                          <p className="text-[12px] font-300 leading-relaxed text-[var(--text-secondary)]">
                            Nada — ninguém tem esta academia como clube favorito, e nenhum post,
                            público salvo ou convite aponta para ela.
                          </p>
                        )}
                      </div>

                      {detached.posts_losing_venue_name > 0 && (
                        <Note tone="warning" icon={<AlertTriangle size={13} />}>
                          <Num>{detached.posts_losing_venue_name}</Num> desses posts{" "}
                          {detached.posts_losing_venue_name === 1 ? "não tem" : "não têm"} o nome do
                          local gravado no próprio post e{" "}
                          {detached.posts_losing_venue_name === 1 ? "perde" : "perdem"} o nome do
                          lugar para sempre — são os publicados antes de 31/07/2026. Os demais
                          mantêm o nome congelado na publicação.
                        </Note>
                      )}

                      <p className="text-[12px] font-300 leading-relaxed text-[var(--text-tertiary)]">
                        {schemas.length > 0 ? (
                          <>
                            Apaga {schemas.length > 1 ? "as duas cópias" : "a cópia"} da academia (
                            {schemas.join(" + ")}) numa transação só.{" "}
                          </>
                        ) : null}
                        Não dá para desfazer.
                      </p>

                      <div className="space-y-3 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-bg)] px-4 py-3.5">
                        <div>
                          <label htmlFor="confirm-slug" className={labelClass}>
                            Identificador da academia
                          </label>
                          <p className="mb-2 text-[11.5px] font-300 leading-relaxed text-[var(--text-secondary)]">
                            Digite{" "}
                            <code className="rounded bg-[var(--surface-raised)] px-1 py-0.5 font-mono text-[11px] text-[var(--text-primary)]">
                              {expectedSlug}
                            </code>{" "}
                            para confirmar que é esta academia. O servidor compara o que você digitar
                            com o slug da linha por trás deste id e recusa se não bater.
                          </p>
                          <input
                            id="confirm-slug"
                            type="text"
                            value={typedSlug}
                            onChange={(e) => setTypedSlug(e.target.value)}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            maxLength={80}
                            disabled={busy}
                            placeholder="digite o identificador"
                            className={fieldClass}
                          />
                        </div>
                        <div>
                          <label htmlFor="delete-reason" className={labelClass}>
                            Motivo (obrigatório)
                          </label>
                          <textarea
                            id="delete-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={2}
                            maxLength={500}
                            disabled={busy}
                            placeholder="Por que esta academia está sendo removida"
                            className={fieldClass}
                          />
                          <p className="mt-1.5 text-[11px] font-300 leading-relaxed text-[var(--text-tertiary)]">
                            Gravado literalmente na auditoria, junto com o seu e-mail. É o único
                            registro que sobrevive a esta ação.
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  {offerDelist && (
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3.5">
                      <p className="text-[12.5px] font-600 text-[var(--text-primary)]">
                        Alternativa: transformar em Diretório
                      </p>
                      <p className="mt-1.5 text-[12px] font-300 leading-relaxed text-[var(--text-secondary)]">
                        O app para de vender os horários desta academia e passa a mostrar a grade
                        livre com o aviso de confirmar a disponibilidade direto com o clube. Nada é
                        apagado: quadras, reservas e histórico continuam. Dá para voltar a qualquer
                        momento pelo tipo, em Definições da academia.
                      </p>
                      {delistError && (
                        <p className="mt-2 text-[11.5px] text-[var(--color-error)]">{delistError}</p>
                      )}
                      <button
                        type="button"
                        onClick={delist}
                        disabled={busy}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--primary)] px-4 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary)] transition-colors hover:bg-[var(--primary)]/8 disabled:opacity-50"
                      >
                        {delisting ? "Transformando…" : "Transformar em Diretório"}
                      </button>
                    </div>
                  )}

                  {alreadyListing && (blocked || unavailable) && (
                    <p className="text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
                      Esta academia <strong>já é Diretório</strong> — o app já não vende os horários
                      dela. Para tirá-la do ar de vez, resolva antes o vínculo que o servidor apontou
                      acima.
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
              <button
                type="button"
                onClick={closeModal}
                disabled={busy}
                className="rounded-full px-4 py-2 text-[12.5px] font-600 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                {delisted ? "Fechar" : "Cancelar"}
              </button>
              {!delisted && preview && !blocked && (
                <button
                  type="button"
                  onClick={remove}
                  disabled={!canConfirm}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-error)] px-4 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <Trash2 size={12} strokeWidth={2.5} />
                  {deleting
                    ? "Apagando…"
                    : preview.cascade.courts > 0
                      ? `Apagar academia e ${plural(preview.cascade.courts, "quadra", "quadras")}`
                      : "Apagar academia"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
