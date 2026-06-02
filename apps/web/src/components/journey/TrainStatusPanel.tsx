import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, TrainFront, Clock } from "lucide-react";
import { getTrainRun } from "~/lib/api";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";

type TrainStatusPanelProps = {
  trainNumber: string;
  trainName?: string;
};

function formatEta(seconds?: number): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function TrainStatusPanel({ trainNumber, trainName }: TrainStatusPanelProps) {
  const [loading, setLoading] = useState(false);
  const [run, setRun] = useState<Awaited<ReturnType<typeof getTrainRun>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canFetch = /^\d{5}$/.test(trainNumber);

  const fetchRun = useCallback(async () => {
    if (!canFetch) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getTrainRun(trainNumber);
      setRun(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [canFetch, trainNumber]);

  useEffect(() => {
    if (canFetch) void fetchRun();
  }, [canFetch, fetchRun]);

  if (!canFetch) return null;

  const upcoming = run?.run.stations.filter((s) => !s.passed && s.haltSeconds >= 180) ?? [];
  const deliveryStops = upcoming.slice(0, 5);

  return (
    <div className="rounded-xl border border-violet/20 bg-violet/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-violet">
        <TrainFront className="size-4" />
        NTES live trajectory
        {trainName && <span className="font-normal text-text-muted">· {trainName}</span>}
      </div>
      <p className="mt-1 text-xs text-text-muted">
        Station halts drive intercept scoring — delivery windows use live expected departure times.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-violet/30"
          disabled={loading}
          onClick={fetchRun}
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : "Refresh NTES"}
        </Button>
        {run?.fallbackUrl && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-violet"
            onClick={() => window.open(run.fallbackUrl, "_blank")}
          >
            Open NTES
            <ExternalLink className="size-3.5" data-icon="inline-end" />
          </Button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-rose">{error}</p>}

      {run && (
        <div className="mt-3 space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-violet/30 text-violet">
              {run.trainName ?? run.run.trainName ?? `Train ${trainNumber}`}
            </Badge>
            {run.delayMinutes != null && (
              <Badge
                variant="outline"
                className={
                  run.delayMinutes > 0 ? "border-amber/30 text-amber" : "border-emerald/30 text-emerald"
                }
              >
                {run.delayMinutes > 0 ? `${run.delayMinutes} min delay` : "On time"}
              </Badge>
            )}
            <Badge variant="secondary" className="text-[10px] uppercase">
              {run.source}
            </Badge>
          </div>

          {run.lastKnownStation && (
            <p className="text-text-secondary">
              Last known: <span className="font-medium text-text-primary">{run.lastKnownStation}</span>
            </p>
          )}
          {run.nextStation && (
            <p className="text-text-secondary">
              Next: <span className="font-medium text-text-primary">{run.nextStation}</span>
            </p>
          )}

          {deliveryStops.length > 0 && (
            <div className="rounded-lg border border-violet/15 bg-void/20 p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">
                Delivery-friendly stops
              </p>
              <ul className="space-y-2">
                {deliveryStops.map((s) => (
                  <li key={s.stationCode} className="flex items-start justify-between gap-2 text-xs">
                    <div>
                      <span className="font-medium text-text-primary">{s.stationName}</span>
                      <span className="text-text-muted"> ({s.stationCode})</span>
                      {s.platform && (
                        <span className="text-text-muted"> · PF {s.platform}</span>
                      )}
                      <div className="text-text-muted">
                        Halt {Math.round(s.haltSeconds / 60)} min
                        {s.expectedDeparture && ` · dep ${s.expectedDeparture}`}
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 border-sky/30 text-sky gap-1">
                      <Clock className="size-3" />
                      {formatEta(s.etaSeconds)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {run.note && <p className="text-xs text-text-muted">{run.note}</p>}
        </div>
      )}
    </div>
  );
}
