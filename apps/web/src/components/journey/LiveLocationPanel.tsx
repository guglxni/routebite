import { useEffect, useState } from "react";
import { Crosshair, Loader2, MapPin, Radio } from "lucide-react";
import type { GPSPosition } from "@routebite/shared/types";
import { useLiveLocation } from "~/hooks/use-live-location";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type LiveLocationPanelProps = {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onLocation?: (position: GPSPosition) => void;
  className?: string;
};

export function LiveLocationPanel({
  enabled,
  onEnabledChange,
  onLocation,
  className,
}: LiveLocationPanelProps) {
  const [lastSent, setLastSent] = useState<number | null>(null);
  const { position, error, watching } = useLiveLocation({
    enabled,
    onUpdate: (pos) => {
      setLastSent(Date.now());
      onLocation?.(pos);
    },
  });

  useEffect(() => {
    if (!enabled) setLastSent(null);
  }, [enabled]);

  return (
    <div
      className={cn(
        "rounded-xl border border-border-subtle bg-surface-raised/40 p-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Crosshair className="size-4 text-emerald" />
            Share live location
          </div>
          <p className="mt-1 text-xs text-text-muted leading-relaxed">
            Helps riders find you at intercept stops. Updates every ~15s while this tab is open.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={enabled ? "default" : "outline"}
          className={enabled ? "bg-emerald text-white hover:bg-emerald/90" : ""}
          onClick={() => onEnabledChange(!enabled)}
        >
          {enabled ? (
            <>
              <Radio className="size-3.5 animate-pulse" data-icon="inline-start" />
              Live
            </>
          ) : (
            "Enable"
          )}
        </Button>
      </div>

      {enabled && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {watching && !error && (
            <Badge variant="outline" className="border-emerald/30 text-emerald gap-1">
              {position ? <MapPin className="size-3" /> : <Loader2 className="size-3 animate-spin" />}
              {position
                ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`
                : "Acquiring GPS…"}
            </Badge>
          )}
          {position?.accuracy != null && (
            <span className="text-text-muted">±{Math.round(position.accuracy)}m</span>
          )}
          {lastSent && (
            <span className="text-text-muted">
              Updated {new Date(lastSent).toLocaleTimeString()}
            </span>
          )}
          {error && <span className="text-rose">{error}</span>}
        </div>
      )}
    </div>
  );
}
