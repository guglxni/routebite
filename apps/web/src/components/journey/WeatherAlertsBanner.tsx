import { CloudRain, Wind, AlertTriangle, CheckCircle2, Leaf } from "lucide-react";
import { cn } from "~/lib/utils";
import type { OutdoorConditionsDto } from "~/lib/api";

export type WeatherWarning = { lat: number; lng: number; title: string };

type WeatherAlertsBannerProps = {
  warnings?: WeatherWarning[] | null;
  outdoorConditions?: OutdoorConditionsDto | null;
  className?: string;
  /** When set, only show warnings near this point (~2 km). */
  near?: { lat: number; lng: number } | null;
};

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function iconFor(kind: string, title: string) {
  const t = `${kind} ${title}`.toLowerCase();
  if (t.includes("pollen")) return Leaf;
  if (t.includes("air") || t.includes("uaqi") || t.includes("naqi")) return Wind;
  if (t.includes("rain") || t.includes("thunder") || t.includes("weather") || t.includes("cloudy"))
    return CloudRain;
  if (t.includes("good") || kind === "good") return CheckCircle2;
  return AlertTriangle;
}

/**
 * Outdoor Conditions — Google Air Quality + Weather (+ Pollen when available).
 */
export function WeatherAlertsBanner({
  warnings,
  outdoorConditions,
  className,
  near,
}: WeatherAlertsBannerProps) {
  const oc = outdoorConditions;
  const legacy = near
    ? (warnings ?? []).filter((w) => haversineKm(near, w) <= 2.5)
    : warnings ?? [];

  if (!oc && legacy.length === 0) return null;

  const severity = oc?.severity ?? (legacy.length ? "watch" : "good");
  const shell =
    severity === "alert"
      ? "border-rose/30 bg-rose/10"
      : severity === "watch"
        ? "border-amber/30 bg-amber/10"
        : "border-emerald/30 bg-emerald/10";
  const labelColor =
    severity === "alert" ? "text-rose" : severity === "watch" ? "text-amber" : "text-emerald";

  const lines =
    oc?.advisories?.length
      ? oc.advisories
      : legacy.map((w) => ({
          kind: "alert" as const,
          title: w.title,
          severity: "watch" as const,
        }));

  // Deduplicate by title for display
  const seen = new Set<string>();
  const unique = lines.filter((l) => {
    const k = l.title.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return (
    <div className={cn("rounded-xl border px-4 py-3", shell, className)}>
      <div
        className={cn(
          "mb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider",
          labelColor,
        )}
      >
        {severity === "good" ? (
          <CheckCircle2 className="size-3.5" />
        ) : (
          <AlertTriangle className="size-3.5" />
        )}
        Outdoor conditions
        {oc?.verified && (
          <span className="rounded bg-black/20 px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-zinc-300">
            Google · verified
          </span>
        )}
      </div>

      {oc?.airQuality && (
        <div className="mb-2 grid grid-cols-2 gap-2 text-[11px] text-zinc-200 sm:grid-cols-4">
          <Metric
            label="UAQI"
            value={
              oc.airQuality.uaqi != null
                ? `${oc.airQuality.uaqi}`
                : "—"
            }
            hint={oc.airQuality.category}
          />
          <Metric
            label="Pollutant"
            value={(oc.airQuality.dominantPollutant ?? "—").toUpperCase()}
          />
          {oc.airQuality.local?.aqi != null && (
            <Metric
              label={oc.airQuality.local.displayName ?? "Local AQI"}
              value={String(oc.airQuality.local.aqi)}
              hint={oc.airQuality.local.category}
            />
          )}
          {oc.weather?.temperatureC != null && (
            <Metric
              label="Weather"
              value={`${Math.round(oc.weather.temperatureC)}°C`}
              hint={oc.weather.condition}
            />
          )}
        </div>
      )}

      <ul className="flex flex-col gap-1.5">
        {unique.slice(0, 5).map((w, i) => {
          const Icon = iconFor(w.kind, w.title);
          const tone =
            w.severity === "alert"
              ? "text-rose/90"
              : w.severity === "watch"
                ? "text-amber/90"
                : "text-emerald/90";
          return (
            <li key={`${w.title}-${i}`} className={cn("flex items-start gap-2 text-xs", tone)}>
              <Icon className="mt-0.5 size-3.5 shrink-0 opacity-80" />
              <span className="leading-snug">{w.title}</span>
            </li>
          );
        })}
      </ul>

      {unique.length > 5 && (
        <p className={cn("mt-1.5 text-[10px] opacity-70", labelColor)}>
          +{unique.length - 5} more
        </p>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="truncate font-semibold tabular-nums text-zinc-100">{value}</div>
      {hint && <div className="truncate text-[10px] text-zinc-400">{hint}</div>}
    </div>
  );
}

/** Badge for intercept cards when a nearby warning exists. */
export function OutdoorRiskChip({
  warnings,
  point,
}: {
  warnings?: WeatherWarning[] | null;
  point: { lat: number; lng: number };
}) {
  if (!warnings?.length) return null;
  const hit = warnings.find((w) => haversineKm(point, w) <= 2.5);
  if (!hit) return null;
  const pollenOrAir = /pollen|air|uaqi|naqi/i.test(hit.title);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold",
        pollenOrAir ? "bg-amber/15 text-amber" : "bg-rose/15 text-rose",
      )}
      title={hit.title}
    >
      {pollenOrAir ? <Wind className="size-3" /> : <CloudRain className="size-3" />}
      {pollenOrAir ? "Air / pollen" : "Weather"}
    </span>
  );
}
