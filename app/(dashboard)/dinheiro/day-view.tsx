"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PaymentLegs } from "@/components/ui/payment-legs";
import { PlayerLink } from "@/components/ui/player-link";
import { cn, formatCurrency } from "@/lib/utils";
import { PanelNote } from "../_components/notes";
import { fetchDayAction, type DayBooking, type DayResult } from "./day-actions";

/**
 * #06 Dinheiro · o dia.
 *
 * O extrato de um dia: tudo que foi ABERTO nele, pago ou não, com o desfecho
 * do Pix de cada perna. As outras abas recortam por desfecho e cada uma conta
 * meia história — esta conta o dia inteiro, na ordem em que aconteceu.
 *
 * O dia é o de São Paulo e quem o decide é o SERVIDOR: sem `date` na chamada
 * ele responde o dia vigente. Por isso "quando virar o dia, muda pro dia
 * vigente" não depende do relógio do navegador — e o vigia de meia-noite
 * abaixo só precisa perceber a virada, não calcular a data.
 */

const DIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "long",
  day: "2-digit",
  month: "long",
});
const HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});
const CURTA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
/** A chave do dia corrente em SP — o que o vigia de meia-noite compara. */
const chaveHoje = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

/** Soma um dia a "YYYY-MM-DD" sem passar por Date e sem risco de fuso. */
function desloca(iso: string, dias: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + dias);
  return t.toISOString().slice(0, 10);
}

/* ── O estado de uma reserva, em uma palavra ───────────────────────────────
   A ordem é de urgência, não de ciclo de vida: quem olha esta tela procura
   dinheiro que não entrou, e cancelada vem primeiro porque muda a pergunta de
   "cobrar" para "estornar". */
type Estado = {
  rotulo: string;
  variant: "success" | "warning" | "error" | "muted" | "info";
  /** A cor do fio à esquerda da linha — o que deixa a lista legível de longe. */
  rail: string;
};

function estadoDe(b: DayBooking): Estado {
  const morta = ["cancelled", "expired", "refunded"].includes(b.booking_status);
  if (morta) {
    return {
      rotulo: b.booking_status === "refunded" ? "estornada" : "cancelada",
      variant: "muted",
      rail: "var(--border)",
    };
  }
  if (b.price_cents === 0) {
    return { rotulo: "grátis", variant: "muted", rail: "var(--border)" };
  }
  if (b.payment_status === "rejected") {
    return { rotulo: "Pix rejeitado", variant: "error", rail: "var(--color-error)" };
  }
  if (b.settled) {
    return { rotulo: "pago", variant: "success", rail: "var(--color-success)" };
  }
  return { rotulo: "falta pagar", variant: "warning", rail: "var(--color-clay)" };
}

export function DayView({ inicial }: { inicial: DayResult }) {
  const [dia, setDia] = useState(inicial.ok ? inicial.date : chaveHoje());
  const [dados, setDados] = useState<DayResult>(inicial);
  const [carregando, setCarregando] = useState(false);
  const hoje = chaveHoje();

  const carregar = useCallback(async (alvo?: string) => {
    setCarregando(true);
    try {
      const r = await fetchDayAction(alvo);
      setDados(r);
      if (r.ok) setDia(r.date);
    } finally {
      setCarregando(false);
    }
  }, []);

  // ── O vigia da meia-noite ───────────────────────────────────────────────
  // Quem deixa o painel aberto atravessa a virada olhando o dia de ontem sem
  // perceber. O intervalo compara a chave do dia em SP a cada minuto e, se ela
  // mudou E o operador estava vendo "hoje", puxa o dia novo — quem estiver
  // navegando dias passados é deixado em paz, porque ali a troca seria um
  // sequestro da tela.
  const diaRef = useRef(dia);
  useEffect(() => {
    diaRef.current = dia;
  }, [dia]);
  useEffect(() => {
    let ultimo = chaveHoje();
    const t = setInterval(() => {
      const agora = chaveHoje();
      if (agora === ultimo) return;
      const eraHoje = diaRef.current === ultimo;
      ultimo = agora;
      if (eraHoje) void carregar();
    }, 60_000);
    return () => clearInterval(t);
  }, [carregar]);

  const rotuloDia = (() => {
    const [y, m, d] = dia.split("-").map(Number);
    // Meio-dia UTC: longe o bastante das bordas para nenhum fuso empurrar a
    // data para o dia vizinho na hora de formatar.
    const txt = DIA.format(new Date(Date.UTC(y, m - 1, d, 12)));
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  })();

  return (
    <div className="space-y-4">
      {/* ── A barra do dia: para onde olhar, e o resumo do que se vê ────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex items-center gap-1">
          <NavBtn onClick={() => void carregar(desloca(dia, -1))} rotulo="Dia anterior">
            <ChevronLeft size={15} />
          </NavBtn>
          <NavBtn
            onClick={() => void carregar(desloca(dia, 1))}
            rotulo="Próximo dia"
            desabilitado={dia >= hoje}
          >
            <ChevronRight size={15} />
          </NavBtn>
        </div>

        <div className="min-w-0">
          <p className="text-[13px] font-600 text-[var(--text-primary)]">{rotuloDia}</p>
          <p className="text-[10.5px] font-300 text-[var(--text-tertiary)]">
            {dia === hoje ? "hoje · vira sozinho à meia-noite" : "abertas neste dia"}
          </p>
        </div>

        {dia !== hoje && (
          <button
            type="button"
            onClick={() => void carregar()}
            className="rounded-full border border-[var(--border)] px-3 py-1 text-[10px] font-600 uppercase tracking-[0.1em] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)]"
          >
            Voltar para hoje
          </button>
        )}

        <button
          type="button"
          onClick={() => void carregar(dia)}
          aria-label="Recarregar"
          className="ml-auto rounded-full border border-[var(--border)] p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-secondary)]"
        >
          <RotateCw size={13} className={cn(carregando && "animate-spin")} />
        </button>
      </div>

      {!dados.ok ? (
        <PanelNote>
          Não foi possível carregar o dia: {dados.error} Os números acima seguem valendo — é só
          esta lista que não veio.
        </PanelNote>
      ) : (
        <>
          {/* ── O resumo do dia: entrou, falta, e quantos jogos ─────────── */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
            <Cel rotulo="Jogos abertos" valor={dados.total.toLocaleString("pt-BR")} />
            <Cel
              rotulo="Entrou"
              valor={formatCurrency(dados.paidCents)}
              tom={dados.paidCents > 0 ? "var(--color-success)" : undefined}
            />
            <Cel
              rotulo="Falta entrar"
              valor={formatCurrency(dados.pendingCents)}
              tom={dados.pendingCents > 0 ? "var(--color-clay)" : undefined}
            />
            <Cel rotulo="Grátis" valor={dados.freeCount.toLocaleString("pt-BR")} />
          </div>

          {dados.bookings.length === 0 ? (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-8 text-center text-[12.5px] font-300 text-[var(--text-tertiary)]">
              Nenhum jogo aberto {dia === hoje ? "hoje" : "neste dia"} — zero real, não falha de
              leitura.
            </p>
          ) : (
            <ul className="space-y-2">
              {dados.bookings.map((b) => (
                <Linha key={b.booking_id} b={b} />
              ))}
            </ul>
          )}

          {dados.bookings.length < dados.total && (
            <PanelNote>
              {dados.bookings.length} de {dados.total} carregados — esta tela pede 500 por vez, e
              as somas acima cobrem o dia inteiro mesmo assim.
            </PanelNote>
          )}
        </>
      )}
    </div>
  );
}

function NavBtn({
  onClick,
  rotulo,
  desabilitado,
  children,
}: {
  onClick: () => void;
  rotulo: string;
  desabilitado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      aria-label={rotulo}
      className="rounded-full border border-[var(--border)] p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)] disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function Cel({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: string }) {
  return (
    <div className="bg-[var(--surface)] px-4 py-3">
      <p className="label-colus text-[8px] text-[var(--text-tertiary)]">{rotulo}</p>
      <p
        className="numeral mt-1 text-[19px] leading-none"
        style={{ color: tom ?? "var(--text-primary)" }}
      >
        {valor}
      </p>
    </div>
  );
}

function Linha({ b }: { b: DayBooking }) {
  const estado = estadoDe(b);
  const morta = estado.variant === "muted" && estado.rotulo !== "grátis";
  return (
    <li
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-3 pl-4 pr-4 sm:flex-nowrap"
      style={{ borderLeft: `3px solid ${estado.rail}` }}
    >
      {/* A hora da abertura é o eixo da lista — tabular para a coluna alinhar. */}
      <span className="numeral w-[46px] shrink-0 text-[13px] tabular-nums text-[var(--text-secondary)]">
        {HORA.format(new Date(b.created_at))}
      </span>

      <span className="min-w-[190px] flex-1">
        <span
          className={cn(
            "block truncate text-[12.5px] font-500",
            morta ? "text-[var(--text-tertiary)] line-through" : "text-[var(--text-primary)]"
          )}
        >
          <PlayerLink userId={b.host.user_id} name={b.host.name} />
          {b.guest ? (
            <>
              {" × "}
              <PlayerLink userId={b.guest.user_id} name={b.guest.name} />
            </>
          ) : (
            <span className="text-[var(--text-tertiary)]"> · sem adversário</span>
          )}
        </span>
        <span className="block truncate text-[10.5px] font-300 text-[var(--text-tertiary)]">
          {[b.club_name, b.court_label].filter(Boolean).join(" · ") || "quadra não registrada"}
          {" · joga "}
          {CURTA.format(new Date(b.starts_at))}
        </span>
      </span>

      {/* Quem pagou a sua metade — a pergunta de quem está no clube.
          Reserva morta não mostra pernas: os "✗" vermelhos acusariam uma dívida
          que deixou de existir no momento do cancelamento, e ali a pergunta
          virou outra — estornar. É a mesma lei que já mantém o vermelho longe
          do convidado que ainda não foi cobrado. */}
      {!morta && (
        <span className="shrink-0">
          <PaymentLegs
            priceCents={b.price_cents}
            host={b.host_payment}
            guest={b.guest_payment ?? undefined}
            hasGuest={!!b.guest}
            guestAwaitingAccept={b.booking_status === "awaiting_guest_accept"}
          />
        </span>
      )}

      <Badge variant={estado.variant}>{estado.rotulo}</Badge>

      <span
        className={cn(
          "w-[86px] shrink-0 text-right",
          b.price_cents > 0
            ? "numeral text-[13.5px] text-[var(--text-primary)]"
            : "text-[10.5px] font-300 text-[var(--text-tertiary)]"
        )}
      >
        {b.price_cents > 0 ? formatCurrency(b.price_cents) : "—"}
      </span>
    </li>
  );
}
