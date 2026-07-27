import { cn } from "~/lib/utils";

type MapOverlayLegendProps = {
  className?: string;
  showIsochrones?: boolean;
  showRoute?: boolean;
  showTraffic?: boolean;
  showYou?: boolean;
  showRider?: boolean;
  showMinDistance?: boolean;
  compact?: boolean;
};

/**
 * Floating legend for JourneyMap overlays (isochrones, route, actors).
 */
export function MapOverlayLegend({
  className,
  showIsochrones = true,
  showRoute = true,
  showTraffic = true,
  showYou = false,
  showRider = false,
  showMinDistance = false,
  compact = false,
}: MapOverlayLegendProps) {
  const items = [
    showRoute && { key: "route", label: "Your route", swatch: "bg-amber" },
    showTraffic && { key: "traffic", label: "Traffic cue", swatch: "bg-sky", dashed: true },
    showMinDistance && { key: "min", label: "Under 5 km (blocked)", swatch: "bg-zinc-500" },
    showIsochrones && { key: "rider", label: "Rider zone", swatch: "bg-violet-400" },
    showIsochrones && { key: "walk", label: "Walk handoff", swatch: "bg-emerald-400" },
    showYou && { key: "you", label: "You", swatch: "bg-emerald-400" },
    showRider && { key: "partner", label: "Delivery partner", swatch: "bg-violet-500" },
  ].filter(Boolean) as Array<{ key: string; label: string; swatch: string; dashed?: boolean }>;

  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-3 left-3 z-10 rounded-xl border border-border-subtle bg-void/85 backdrop-blur-md shadow-lg",
        compact ? "px-2.5 py-2" : "px-3 py-2.5",
        className,
      )}
    >
      <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-text-muted">
        Map layers
      </p>
      <ul className={cn("flex flex-col gap-1", compact && "gap-0.5")}>
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-2 text-[10px] text-text-secondary">
            <span
              className={cn(
                "size-2.5 shrink-0 rounded-sm",
                item.swatch,
                item.dashed && "opacity-60 ring-1 ring-sky/40",
              )}
            />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
