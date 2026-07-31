import { Badge } from "@/components/ui/badge";
import { Timestamp } from "@/components/ui/timestamp";
import type { components } from "@/lib/api/openapi";

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
  "notificação. Quem recusou fica sem aparelho listado, mesmo tendo celular.";

/**
 * ── DeviceCell — a versão de tabela ───────────────────────────────────────────
 *
 * Compacta de propósito: uma linha de tabela responde "iOS ou Android?", e quem
 * quiser a versão exata do SO abre o dossiê. Plataformas distintas viram badges
 * (um usuário com iPhone e Android tem os dois); a versão do SO só aparece
 * quando é a MESMA em todos os aparelhos — senão seria escolher um aparelho
 * arbitrário pra representar a pessoa.
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

  const platforms = [...new Set(list.map((d) => d.platform))];

  // A versão do SO só aparece na tabela quando há UM aparelho: com dois, a linha
  // teria de escolher um deles pra representar a pessoa, e a escolha seria
  // arbitrária. Quem precisa do detalhe de cada aparelho abre o dossiê.
  const only = list.length === 1 ? osLabel(list[0].platform, list[0].os_version) : "";

  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex flex-wrap gap-1">
        {platforms.map((p) => (
          <Badge key={p} variant="muted">
            {platformLabel(p)}
          </Badge>
        ))}
      </span>
      {only ? (
        <span className="truncate text-[10.5px] leading-none text-[var(--text-tertiary)]">
          {only}
        </span>
      ) : null}
    </span>
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
