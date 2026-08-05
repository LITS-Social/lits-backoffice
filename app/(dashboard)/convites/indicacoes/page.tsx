import Link from "next/link";
import { ArrowUpRight, Trophy } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Timestamp } from "@/components/ui/timestamp";
import { getApi } from "@/lib/api";
import { StatRail } from "../../_components/stat-rail";
import { PanelError, PanelNote, TruncationNote } from "../../_components/notes";
import {
  MGM_FRAUD_NOTE,
  MGM_REWARD_SLOTS,
  MGM_SENT_NOTE,
  MGM_STATUS_NOTE,
} from "../../_components/mgm";
import { InviteeRow } from "./invitee-row";

/**
 * Indicações (MGM) — o detalhe por convidador do card "Convites entre
 * jogadores" do Norte do Produto.
 *
 * Vive DENTRO de /convites de propósito nenhum: são mecânicas diferentes. O
 * painel 03 (/convites) é convite de RESERVA aguardando resposta — operacional,
 * "quem eu cutuco agora". Esta página é a INDICAÇÃO jogador→jogador (código
 * compartilhável ou telefone declarado antes do cadastro; prêmio VIP a 3
 * indicados que JOGARAM — cadastro deixou de bastar em 05/08, ADR-0064 §3-bis).
 * Compartilham a rota-mãe porque o founder procura os dois debaixo de
 * "convites"; cada uma diz logo no topo o que ela NÃO é.
 *
 * É também a única superfície do painel que ESCREVE no MGM: marcar fraude e
 * desfazer (ADR-0064 §8), em InviteeRow. Ver MGM_FRAUD_NOTE.
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
  const played = referrals.reduce((s, r) => s + r.played, 0);
  const rewarded = referrals.filter((r) => r.reward_reached).length;
  // A LEITURA ERRADA QUE ESTE NÚMERO EXISTE PARA IMPEDIR: convidador com os 3
  // slots ocupados e menos de 3 jogos. Antes de 05/08 ele aparecia como
  // "prêmio atingido"; hoje ele NÃO conquistou nada, e sem um contador próprio
  // a diferença ficaria escondida dentro de "Convidadores".
  const fullButUnearned = referrals.filter(
    (r) => r.active >= MGM_REWARD_SLOTS && r.played < MGM_REWARD_SLOTS
  ).length;

  return (
    <div>
      <PageHeader
        eyebrow="03 · MGM"
        title="Indicações entre jogadores"
        description="Um convidador por linha, com seus indicados — quem foi nomeado por telefone e ainda não se cadastrou, quem entrou e quem já jogou. Não é o convite de partida — esse vive em Convites em Aberto."
      />

      <StatRail
        stats={[
          {
            label: "Convidadores",
            value: total,
            hint: "pessoas com ≥1 indicação registrada, incluindo vaga só reservada",
          },
          {
            label: "Indicações",
            value: accepted,
            hint:
              referrals.length < total
                ? "linhas no ledger (vagas reservadas incluídas) — soma dos convidadores listados"
                : "linhas no ledger, vagas reservadas incluídas. Piso: aceite descartado não deixa linha",
          },
          {
            label: "Jogaram",
            value: played,
            hint: "indicados cuja janela de reserva terminou — a única conta que vale prêmio",
          },
          {
            label: "Prêmio atingido",
            value: rewarded,
            tone: "calm",
            hint: `${MGM_REWARD_SLOTS} indicados que JOGARAM (VIP) — cadastro não basta desde 05/08`,
          },
          {
            label: "Slots cheios sem prêmio",
            value: fullButUnearned,
            tone: "attention",
            hint: `${MGM_REWARD_SLOTS} vagas ocupadas e menos de ${MGM_REWARD_SLOTS} jogos — parece conquistado e não é`,
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
            Nenhuma indicação registrada ainda — zero real, não falha de leitura. O funil ganha
            linha de dois jeitos: quando um convidador nomeia o telefone de alguém (POST
            /v1/mgm/invites, a vaga fica “reservada”) ou quando alguém aceita um código (POST
            /v1/mgm/accept).
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
                  {/* O selo diz JOGARAM, não "convites". Com o rótulo antigo,
                      "3 convites · VIP" ao lado de um contador de aceites lia-se
                      como "3 aceites = prêmio" — que é exatamente a conta que
                      deixou de valer em 05/08. */}
                  {r.reward_reached && (
                    <Badge variant="success">
                      <Trophy size={9} strokeWidth={2.25} />
                      {MGM_REWARD_SLOTS} jogaram · VIP
                    </Badge>
                  )}
                  {/* O caso que engana: slots cheios, prêmio não. Sem este selo
                      a linha mostraria "3 aceites" e nenhum sinal de que o
                      convidador NÃO conquistou nada. */}
                  {!r.reward_reached && r.active >= MGM_REWARD_SLOTS && (
                    <Badge variant="warning">
                      slots cheios · sem prêmio
                    </Badge>
                  )}
                  <span className="ml-auto text-[11px] font-300 text-[var(--text-tertiary)]">
                    {/* O numeral grande é o que conta prêmio. O resto é contexto:
                        aceite é PISO e vaga reservada nem indicado tem ainda. */}
                    <span
                      className={
                        r.reward_reached
                          ? "numeral text-[15px] text-[var(--color-success)]"
                          : "numeral text-[15px] text-[var(--text-primary)]"
                      }
                    >
                      {r.played}/{MGM_REWARD_SLOTS}
                    </span>{" "}
                    jogaram · {r.accepted} no total
                    {r.declared > 0 && <> · {r.declared} reservados</>}
                    {r.active !== r.accepted && <> · {r.active} ativos</>}
                    {" · último "}
                    <Timestamp iso={r.last_accepted_at} relativeOnly />
                  </span>
                </div>

                <ul className="mt-3 border-t border-[var(--border)] pt-3">
                  {/* A key é o invite_id: é o único identificador que TODA linha
                      tem. user_id vem vazio na vaga reservada (status
                      'declared'), e duas delas no mesmo convidador colidiriam —
                      o React reaproveitaria a linha errada, e agora que a linha
                      tem botão de escrita isso significaria marcar a errada. */}
                  {(r.invitees ?? []).map((inv) => (
                    <InviteeRow key={inv.invite_id} inv={inv} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        <p className="border-t border-[var(--border)] pt-3 text-[10.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          {MGM_FRAUD_NOTE}
        </p>

        <p className="text-[10.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
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
