import Link from "next/link";
import { ArrowUpRight, Trophy } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Timestamp } from "@/components/ui/timestamp";
import { getApi } from "@/lib/api";
import { StatRail } from "../../_components/stat-rail";
import { PanelError, PanelNote, TruncationNote } from "../../_components/notes";
import { MGM_SENT_NOTE, MGM_STATUS_NOTE, mgmStatusLabel } from "../../_components/mgm";

/**
 * Indicações (MGM) — o detalhe por convidador do card "Convites entre
 * jogadores" do Norte do Produto.
 *
 * Vive DENTRO de /convites de propósito nenhum: são mecânicas diferentes. O
 * painel 03 (/convites) é convite de RESERVA aguardando resposta — operacional,
 * "quem eu cutuco agora". Esta página é a INDICAÇÃO jogador→jogador (código
 * compartilhável, prêmio VIP aos 3 aceites). Compartilham a rota-mãe porque o
 * founder procura os dois debaixo de "convites"; cada uma diz logo no topo o
 * que ela NÃO é.
 */
export default async function IndicacoesMgmPage() {
  const api = await getApi();
  const { data, error } = await api.GET("/v1/ops/mgm-referrals", {
    params: { query: { limit: 200, offset: 0 } },
  });

  if (error) {
    return (
      <PanelError
        eyebrow="03 · MGM"
        title="Indicações entre jogadores"
        detail={error.detail || error.title}
      />
    );
  }

  const referrals = data.referrals ?? [];
  const total = data.total ?? referrals.length;
  // Somas sobre a PÁGINA carregada. Com o corte em 200 convidadores e a escala
  // do beta isso é tudo; quando deixar de ser, o TruncationNote abaixo avisa e
  // os hints dizem "dos listados" — número parcial confessa, não arredonda.
  const accepted = referrals.reduce((s, r) => s + r.accepted, 0);
  const rewarded = referrals.filter((r) => r.reward_reached).length;

  return (
    <div>
      <PageHeader
        eyebrow="03 · MGM"
        title="Indicações entre jogadores"
        description="Quem convida e quem aceitou o código, um convidador por linha. Não é o convite de partida — esse vive em Convites em Aberto."
      />

      <StatRail
        stats={[
          {
            label: "Convidadores",
            value: total,
            hint: "pessoas com ≥1 aceite registrado",
          },
          {
            label: "Aceites",
            value: accepted,
            hint:
              referrals.length < total
                ? "piso — soma dos convidadores listados"
                : "piso — aceite descartado não deixa linha",
          },
          {
            label: "Prêmio atingido",
            value: rewarded,
            tone: "calm",
            hint: "completaram os 3 convites (VIP)",
          },
        ]}
      />

      <div className="space-y-3 px-4 sm:px-8 py-6">
        <PanelNote>
          Convites de reserva aguardando resposta ficam em{" "}
          <Link
            href="/convites"
            className="font-600 text-[var(--primary)] transition-opacity hover:opacity-70"
          >
            Convites em Aberto
          </Link>
          . {MGM_STATUS_NOTE}
        </PanelNote>

        <TruncationNote
          shown={referrals.length}
          total={total}
          noun="convidadores"
          reason="O fetch traz os primeiros 200 por aceites; o restante não chega ao painel."
        />

        {referrals.length === 0 ? (
          <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-6 text-[12.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
            Nenhum aceite de indicação registrado ainda — zero real, não falha de leitura. O
            funil só ganha linha quando alguém aceita um código (POST /v1/mgm/accept).
          </p>
        ) : (
          <ul className="space-y-3">
            {referrals.map((r) => (
              <li
                key={r.inviter_id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                  <span className="text-[13.5px] font-600 text-[var(--text-primary)]">
                    {r.name}
                  </span>
                  {r.reward_reached && (
                    <Badge variant="success">
                      <Trophy size={9} strokeWidth={2.25} />
                      3 convites · VIP
                    </Badge>
                  )}
                  <span className="ml-auto text-[11px] font-300 text-[var(--text-tertiary)]">
                    <span className="numeral text-[15px] text-[var(--text-primary)]">
                      {r.accepted}
                    </span>{" "}
                    {r.accepted === 1 ? "aceite" : "aceites"}
                    {r.active !== r.accepted && <> · {r.active} ativos</>}
                    {" · último "}
                    <Timestamp iso={r.last_accepted_at} relativeOnly />
                  </span>
                </div>

                <ul className="mt-3 space-y-1.5 border-t border-[var(--border)] pt-3">
                  {(r.invitees ?? []).map((inv) => (
                    <li
                      key={inv.user_id}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
                    >
                      <span className="min-w-0 flex-1 truncate text-[12px] font-400 text-[var(--text-secondary)]">
                        {inv.name}
                      </span>
                      <Badge variant={inv.status === "first_match" ? "default" : "info"}>
                        {mgmStatusLabel(inv.status)}
                      </Badge>
                      <Timestamp iso={inv.accepted_at} className="text-[11px] font-300" />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        <p className="border-t border-[var(--border)] pt-3 text-[10.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          {MGM_SENT_NOTE}
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-1 font-700 text-[9px] uppercase tracking-[0.16em] text-[var(--primary)] transition-opacity hover:opacity-70"
        >
          Agregado no Norte do Produto <ArrowUpRight size={11} />
        </Link>
      </div>
    </div>
  );
}
