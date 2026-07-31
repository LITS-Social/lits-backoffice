import { Badge } from "@/components/ui/badge";
import { Timestamp } from "@/components/ui/timestamp";
import type { components } from "@/lib/api/openapi";
import { cn } from "@/lib/utils";

type OpsUserDevice = components["schemas"]["OpsUserDevice"];

/**
 * ── Dispositivos ──────────────────────────────────────────────────────────────
 *
 * "Que aparelho essa pessoa usa" — a pergunta do Arthur, respondida com a única
 * fonte que existe: o registro de push (`lits.push_tokens`).
 *
 * E é aí que mora a armadilha que estes componentes existem pra desarmar. A
 * linha só nasce quando o app CONSEGUE registrar um token FCM, o que exige a
 * permissão de notificação. Quem recusou não tem nenhuma linha — e uma célula
 * vazia numa tabela de gente lê como fato sobre a PESSOA ("não tem celular"),
 * não como fato sobre o nosso DADO ("não temos registro"). Por isso o estado
 * vazio aqui nunca é um traço mudo: ele diz o que é.
 */

/** Rótulo humano por plataforma. Uma plataforma que não conhecemos aparece crua. */
const PLATFORM_LABELS: Record<string, string> = {
  ios: "iOS",
  android: "Android",
  web: "Web",
};

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

/**
 * Ordem de leitura fixa. A API devolve os aparelhos por RENOVAÇÃO de push, não
 * por plataforma, então sem isto duas pessoas com exatamente os mesmos aparelhos
 * apareceriam como "iOS + Android" e "Android + iOS" conforme quem abriu o app
 * por último — e uma coluna que muda de forma não se lê de relance.
 */
const PLATFORM_ORDER = ["ios", "android", "web"];

export type PlatformTally = { platform: string; devices: number };

/**
 * Uma linha por PLATAFORMA, não por aparelho: três iPhones somam "iOS ×3", e é
 * essa lista deduplicada que responde "de onde essa pessoa vem". `devices.length`
 * continua sendo a contagem de aparelhos — as duas perguntas são diferentes.
 */
export function tallyPlatforms(devices: OpsUserDevice[]): PlatformTally[] {
  const counts = new Map<string, number>();
  for (const d of devices) counts.set(d.platform, (counts.get(d.platform) ?? 0) + 1);

  const rank = (p: string) => {
    const i = PLATFORM_ORDER.indexOf(p);
    return i === -1 ? PLATFORM_ORDER.length : i; // plataforma nova cai no fim, na ordem em que veio
  };

  return [...counts.entries()]
    .map(([platform, count]) => ({ platform, devices: count }))
    .sort((a, b) => rank(a.platform) - rank(b.platform));
}

/** Rótulo de crachá: "iOS", "iOS + Android". */
export function platformsLabel(tally: PlatformTally[]): string {
  return tally.map((t) => platformLabel(t.platform)).join(" + ");
}

/** A mesma informação em frase, pro dossiê: "Usa iOS e Android". */
export function platformsSentence(tally: PlatformTally[]): string {
  const names = tally.map((t) => platformLabel(t.platform));
  if (names.length <= 1) return `Usa ${names[0] ?? ""}`;
  return `Usa ${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/**
 * O app manda a versão do SO CRUA — `ios.systemVersion` = "18.2",
 * `android.version.release` = "14" (lits_headers_interceptor.dart:87). Sozinho,
 * "18.2" não diz de que sistema é. A plataforma vem da coluna ao lado, então é
 * aqui que as duas viram a frase que o operador espera ler: "iOS 18.2".
 *
 * Devolve string vazia quando o aparelho não reportou versão — quem chama
 * decide o que dizer nesse caso, e não é "iOS " com um buraco no fim.
 */
export function osLabel(platform: string, osVersion?: string): string {
  const v = osVersion?.trim();
  if (!v) return "";
  return `${platformLabel(platform)} ${v}`;
}

/**
 * A frase que qualifica o dado. No dossiê ela vem do BFF (`devices_caveat`, um
 * campo real justamente pra não poder ser apagada por um redesign); na lista não
 * há de onde puxar, então mora aqui — com o mesmo teor.
 */
export const DEVICE_SOURCE_NOTE =
  "A coluna Aparelho vem do registro de push: só aparece quem concedeu permissão de " +
  "notificação. Quem recusou fica sem aparelho listado, mesmo tendo celular. " +
  "O crachá destacado \"iOS + Android\" é quem registrou push nas duas plataformas.";

/**
 * ── DeviceCell — a versão de tabela ───────────────────────────────────────────
 *
 * Compacta de propósito: uma linha de tabela responde "de onde essa pessoa
 * vem?", e quem quiser a versão exata do SO abre o dossiê.
 *
 * Quem usa DUAS plataformas é a exceção que interessa, e a primeira versão desta
 * célula a escondia: dois crachás vazados lado a lado, no meio de uma coluna
 * inteira de crachás vazados, some numa varredura rápida. Aqui as duas viram UM
 * crachá preenchido ("iOS + Android") — um fato só, com fundo, sendo a única
 * coisa colorida da coluna. É a diferença entre o operador ter que ler a coluna e
 * a coluna se anunciar sozinha.
 *
 * A versão do SO só aparece quando há UM aparelho; com mais de um, a linha teria
 * de eleger um deles pra representar a pessoa. No lugar dela vai a contagem, que
 * vale pra qualquer número de aparelhos.
 */
export function DeviceCell({ devices }: { devices?: OpsUserDevice[] | null }) {
  const list = devices ?? [];

  if (list.length === 0) {
    return (
      <span
        className="text-[11px] text-[var(--text-tertiary)]"
        title="Nenhum registro de push para esta conta — provavelmente a permissão de notificação foi recusada. Não quer dizer que não tenha celular."
      >
        sem registro
      </span>
    );
  }

  const tally = tallyPlatforms(list);
  const multi = tally.length > 1;

  const only = list.length === 1 ? osLabel(list[0].platform, list[0].os_version) : "";
  const detail = only || (list.length > 1 ? `${list.length} aparelhos` : "");

  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex flex-wrap gap-1">
        {multi ? (
          // `whitespace-normal` sobrescreve o nowrap do Badge: numa combinação
          // improvável e longa o crachá quebra em duas linhas em vez de ser
          // cortado pelo overflow da tabela.
          <Badge variant="info" className="max-w-full whitespace-normal">
            {platformsLabel(tally)}
          </Badge>
        ) : (
          <Badge variant="muted">{platformLabel(tally[0].platform)}</Badge>
        )}
      </span>
      {detail ? (
        <span className="truncate text-[10.5px] leading-none text-[var(--text-tertiary)]">
          {detail}
        </span>
      ) : null}
    </span>
  );
}

/**
 * ── DeviceSummary — a resposta antes do detalhe ───────────────────────────────
 *
 * No dossiê a lista abaixo tem uma linha por APARELHO; esta tem uma linha só,
 * por PESSOA. Sem ela, "usa iPhone e Android" era uma conclusão que o operador
 * tinha de tirar sozinho comparando crachás de três itens — e três iPhones se
 * pareciam com três plataformas.
 *
 * O caso multi-plataforma ganha fundo e borda próprios porque é o único que
 * muda o que se faz com a informação (testar um bug nos dois, ou não).
 */
export function DeviceSummary({ devices }: { devices: OpsUserDevice[] }) {
  const tally = tallyPlatforms(devices);
  if (tally.length === 0) return null;

  const multi = tally.length > 1;

  // Com um aparelho só, a linha de baixo já diz tudo — repetir "1 aparelho" aqui
  // é ruído.
  const breakdown =
    devices.length < 2
      ? ""
      : multi
        ? `${devices.length} aparelhos: ${tally
            .map((t) => `${t.devices} ${platformLabel(t.platform)}`)
            .join(", ")}`
        : `${devices.length} aparelhos`;

  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-4 py-3",
        multi
          ? "border-[var(--color-info)]/30 bg-[var(--color-info-bg)]"
          : "border-[var(--border)] bg-[var(--surface)]"
      )}
    >
      {/* Na faixa tingida do caso multi o fundo do crachá `info` é a MESMA cor da
          faixa e o crachá desaparece; ali ele vira um chip claro sobre o tingido. */}
      <Badge variant="info" className={multi ? "bg-[var(--surface)]" : undefined}>
        {platformsLabel(tally)}
      </Badge>
      <span className="text-[13px] font-500 text-[var(--text-primary)]">
        {platformsSentence(tally)}
      </span>
      {breakdown ? (
        <span className="text-[11.5px] text-[var(--text-secondary)]">{breakdown}</span>
      ) : null}
    </div>
  );
}

/**
 * ── DeviceList — a versão de dossiê ───────────────────────────────────────────
 *
 * Aqui a pergunta é sobre UMA pessoa, então cabe o aparelho inteiro: plataforma,
 * versão do SO, versão do app e quando o push foi registrado/renovado.
 *
 * `os_version` só passou a ser gravada em 31/07/2026 (migration
 * 20260731120000), e só é capturada no momento do registro do push — não a cada
 * request. Aparelho que não re-registrou desde então não tem o dado, e isso é
 * dito na linha em vez de virar um campo em branco.
 *
 * O valor guardado é a versão CRUA ("18.2", "14"); ver osLabel.
 */
export function DeviceList({ devices }: { devices: OpsUserDevice[] }) {
  return (
    <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      {devices.map((d, i) => {
        // "18.2" sozinho não diz de que sistema é — osLabel junta com a
        // plataforma e devolve a frase inteira ("iOS 18.2").
        const os = osLabel(d.platform, d.os_version);
        const app = d.app_version?.trim();

        return (
          <li key={d.device_id || `${d.platform}-${i}`} className="px-4 py-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
              <span className="flex flex-wrap items-baseline gap-2.5">
                <Badge variant="info">{platformLabel(d.platform)}</Badge>

                {/* O pedido do Arthur, em tamanho de leitura. */}
                {os ? (
                  <span className="text-[13px] font-500 text-[var(--text-primary)]">{os}</span>
                ) : (
                  <span className="text-[11.5px] text-[var(--text-tertiary)]">
                    versão do SO não reportada
                  </span>
                )}

                {app ? (
                  <span className="text-[11.5px] text-[var(--text-secondary)]">app {app}</span>
                ) : null}
              </span>

              {d.last_seen ? (
                <span className="flex shrink-0 items-baseline gap-1.5">
                  <span className="label-colus text-[8.5px] text-[var(--text-tertiary)]">
                    Push renovado
                  </span>
                  <Timestamp
                    iso={d.last_seen}
                    className="text-[11px] text-[var(--text-tertiary)]"
                  />
                </span>
              ) : null}
            </div>

            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-[var(--text-tertiary)]">
              {d.device_id ? <span>device {d.device_id}</span> : null}
              {d.first_seen ? (
                <span>
                  registrado em <Timestamp iso={d.first_seen} className="font-mono text-[10px]" />
                </span>
              ) : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
