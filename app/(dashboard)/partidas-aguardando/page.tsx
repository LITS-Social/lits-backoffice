import { CloudRain, Cloudy, Sun, MapPin, Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { upcomingMatches, type WeatherAlert } from "@/lib/mock";
import { formatDate } from "@/lib/utils";

function WeatherBadge({ weather }: { weather: WeatherAlert }) {
  if (weather === "rain")
    return (
      <Badge variant="error">
        <CloudRain size={10} /> Chuva prevista
      </Badge>
    );
  if (weather === "uncertain")
    return (
      <Badge variant="warning">
        <Cloudy size={10} /> Incerto
      </Badge>
    );
  return (
    <Badge variant="success">
      <Sun size={10} /> Tempo bom
    </Badge>
  );
}

function TypeBadge({ type }: { type: "ranked" | "casual" }) {
  return (
    <Badge variant={type === "ranked" ? "info" : "muted"}>
      {type === "ranked" ? "Rankeada" : "Casual"}
    </Badge>
  );
}

export default function PartidasAguardandoPage() {
  const rainAlerts = upcomingMatches.filter((m) => m.weather === "rain");

  return (
    <div>
      <PageHeader
        eyebrow="#01"
        title="Partidas Aguardando Jogo"
        description="Partidas marcadas e aceitas que ainda não aconteceram. Alertas de chuva em destaque para ação preventiva."
        action={
          rainAlerts.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-error-bg)] border border-[var(--color-error)]/30 text-[12px] font-sans font-600 text-[var(--color-error)]">
              <CloudRain size={13} />
              {rainAlerts.length} com alerta de chuva
            </span>
          ) : null
        }
      />

      <div className="px-8 py-6 space-y-3">
        {upcomingMatches.map((match) => (
          <div
            key={match.id}
            className={`rounded-xl border p-5 transition-colors ${
              match.weather === "rain"
                ? "bg-[var(--color-error-bg)] border-[var(--color-error)]/25"
                : "bg-[var(--surface)] border-[var(--border)]"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              {/* Players */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[14px] font-sans font-600 text-[var(--text-primary)]">
                    {match.player1}
                  </span>
                  <span className="text-[11px] font-sans text-[var(--text-tertiary)]">
                    vs
                  </span>
                  <span className="text-[14px] font-sans font-600 text-[var(--text-primary)]">
                    {match.player2}
                  </span>
                  <Badge variant="muted">{match.category}</Badge>
                  <TypeBadge type={match.type} />
                </div>
                <div className="flex items-center gap-4 text-[12px] font-sans text-[var(--text-secondary)]">
                  <span className="flex items-center gap-1">
                    <MapPin size={11} />
                    {match.club} — {match.court}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {formatDate(match.datetime)}
                  </span>
                </div>
              </div>
              {/* Weather */}
              <div className="shrink-0">
                <WeatherBadge weather={match.weather} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
