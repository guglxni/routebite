import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { BorderBeam } from "~/components/ui/border-beam";
import { cn } from "~/lib/utils";
import CountUp from "~/components/CountUp";
import type { CorridorCoverage } from "~/lib/api";
import { ChefHat, ShoppingBag, Sparkles, Timer, TrainFront, ArrowRightLeft } from "lucide-react";

const tierTone: Record<string, string> = {
  rich: "bg-emerald/15 text-emerald border-emerald/30",
  ok: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  thin: "bg-amber/15 text-amber border-amber/30",
  none: "bg-rose/15 text-rose border-rose/30",
};

export function CoverageBadges({
  coverage,
  loading,
  onProbe,
}: {
  coverage: CorridorCoverage | null;
  loading?: boolean;
  onProbe?: () => void;
}) {
  return (
    <Card className="relative overflow-hidden border-border-subtle bg-surface-raised/50">
      {coverage && <BorderBeam duration={8} size={60} />}
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Corridor coverage</CardTitle>
            <CardDescription>Swiggy Food + Instamart at this intercept</CardDescription>
          </div>
          {onProbe && (
            <Button size="sm" variant="outline" onClick={onProbe} disabled={loading}>
              {loading ? "Probing…" : "Probe"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!coverage && !loading && (
          <p className="text-xs text-muted-foreground">
            Probe to see OPEN kitchens and Instamart stock at this stop.
          </p>
        )}
        {coverage && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={cn("border", tierTone[coverage.food.tier])}>
                <ChefHat className="size-3" />
                Food · {coverage.food.openCount} open · {coverage.food.tier}
              </Badge>
              <Badge variant="outline" className={cn("border", tierTone[coverage.instamart.tier])}>
                <ShoppingBag className="size-3" />
                IM · {coverage.instamart.productCount} · {coverage.instamart.tier}
              </Badge>
              {coverage.food.swiggyDistanceKmAvg != null && (
                <Badge variant="secondary">
                  avg {coverage.food.swiggyDistanceKmAvg} km (Swiggy)
                </Badge>
              )}
            </div>
            {coverage.mealHint && (
              <p className="text-xs text-text-secondary flex items-start gap-2">
                <Sparkles className="size-3.5 mt-0.5 text-amber shrink-0" />
                {coverage.mealHint.hint}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function HaltGateAlert({
  gate,
}: {
  gate: {
    ok: boolean;
    severity: string;
    message: string;
    recommendation?: string;
    slackSeconds?: number;
    dwellSeconds?: number;
    requiredSeconds?: number;
  } | null;
}) {
  if (!gate) return null;
  const tone =
    gate.severity === "fail"
      ? "border-rose/40 text-rose"
      : gate.severity === "tight"
        ? "border-amber/40 text-amber"
        : "border-emerald/40 text-emerald";
  return (
    <Alert className={cn("border bg-surface-raised/40", tone)}>
      <TrainFront />
      <AlertTitle>Halt window</AlertTitle>
      <AlertDescription className="flex flex-col gap-1">
        <span>{gate.message}</span>
        {gate.recommendation && (
          <span className="text-muted-foreground">{gate.recommendation}</span>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function DualClockPanel({
  dualClock,
  alignment,
}: {
  dualClock?: {
    clocks: {
      you: { label: string; etaSeconds: number | null };
      rider: { label: string; etaSeconds: number | null };
      kitchen: { label: string; etaSeconds: number | null };
    };
    honesty?: { note: string };
    deltaSeconds?: number | null;
  } | null;
  alignment?: {
    status: string;
    color: string;
    score?: number;
    recommendation?: string;
  } | null;
}) {
  if (!dualClock && !alignment) return null;
  const fmt = (s: number | null | undefined) => {
    if (s == null) return "—";
    return `${Math.max(0, Math.round(s / 60))}m`;
  };
  return (
    <Card className="relative overflow-hidden border-border-subtle">
      <BorderBeam colorFrom="#38bdf8" colorTo="#E8A838" duration={9} />
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Timer className="size-4 text-amber" />
          Dual clock
        </CardTitle>
        <CardDescription>
          {alignment ? (
            <span style={{ color: alignment.color }}>
              {alignment.status}
              {alignment.score != null ? ` · ${Math.round(alignment.score)}` : ""}
            </span>
          ) : (
            "You vs rider vs kitchen"
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              ["you", dualClock?.clocks.you],
              ["rider", dualClock?.clocks.rider],
              ["kitchen", dualClock?.clocks.kitchen],
            ] as const
          ).map(([key, clock]) => (
            <div key={key} className="rounded-xl bg-surface-elevated/60 p-3 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                {clock?.label ?? key}
              </div>
              <div className="font-serif text-2xl text-text-primary">
                {clock?.etaSeconds != null ? (
                  <CountUp to={Math.round(clock.etaSeconds / 60)} duration={0.8} />
                ) : (
                  "—"
                )}
                <span className="text-sm text-muted-foreground ml-0.5">m</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">{fmt(clock?.etaSeconds)}</div>
            </div>
          ))}
        </div>
        {alignment?.score != null && (
          <Progress value={alignment.score} className="h-1.5" />
        )}
        {alignment?.recommendation && (
          <p className="text-xs text-text-secondary">{alignment.recommendation}</p>
        )}
        {dualClock?.honesty?.note && (
          <p className="text-[11px] text-muted-foreground">{dualClock.honesty.note}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function ReInterceptBanner({
  suggestion,
  onSwitch,
}: {
  suggestion: {
    shouldSwitch: boolean;
    reason: string;
    recommendedInterceptId: string | null;
    recommendedName: string | null;
  } | null;
  onSwitch?: (id: string) => void;
}) {
  if (!suggestion?.shouldSwitch || !suggestion.recommendedInterceptId) return null;
  return (
    <Alert className="border border-violet-500/30 bg-violet-500/10">
      <ArrowRightLeft />
      <AlertTitle>Re-intercept suggested</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <span>{suggestion.reason}</span>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{suggestion.recommendedName ?? suggestion.recommendedInterceptId}</Badge>
          {onSwitch && (
            <Button
              size="sm"
              className="bg-amber text-void hover:bg-amber-light"
              onClick={() => onSwitch(suggestion.recommendedInterceptId!)}
            >
              Switch stop
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function DeferredPlaceCard({
  deferred,
}: {
  deferred?: {
    autoPlaceAt: string | null;
    placeAttempts: number;
    lastPlaceError: string | null;
    mealQueryHint: string | null;
    haltGate?: { message: string; severity: string } | null;
  } | null;
}) {
  if (!deferred) return null;
  const when = deferred.autoPlaceAt
    ? new Date(deferred.autoPlaceAt).toLocaleString("en-IN", {
        hour: "numeric",
        minute: "2-digit",
        day: "numeric",
        month: "short",
      })
    : "—";
  return (
    <Card className="relative overflow-hidden border-amber/30 bg-amber/5">
      <BorderBeam duration={7} />
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Deferred place queued</CardTitle>
        <CardDescription>
          Swiggy has no schedule API — RouteBite places at {when}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-xs text-text-secondary">
        {deferred.mealQueryHint && <span>Meal priming: {deferred.mealQueryHint}</span>}
        <span>Attempts: {deferred.placeAttempts}</span>
        {deferred.lastPlaceError && (
          <span className="text-rose">{deferred.lastPlaceError}</span>
        )}
        {deferred.haltGate && <span>{deferred.haltGate.message}</span>}
      </CardContent>
    </Card>
  );
}

export function HopPackSummary({
  plan,
}: {
  plan: {
    foodHops: Array<{ note: string; subtotalRupees: number }>;
    instamartHops: Array<{ note: string; subtotalRupees: number }>;
    warnings: string[];
    foodCapRupees: number;
  } | null;
}) {
  if (!plan) return null;
  if (plan.foodHops.length <= 1 && plan.instamartHops.length <= 1 && !plan.warnings.length) {
    return null;
  }
  return (
    <Card className="border-border-subtle">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Multi-hop packing</CardTitle>
        <CardDescription>Under ₹{plan.foodCapRupees} Food / Instamart mins</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-xs">
        {plan.foodHops.map((h, i) => (
          <div key={`f-${i}`} className="flex justify-between gap-2 rounded-lg bg-surface-elevated/50 px-3 py-2">
            <span>{h.note}</span>
            <span className="font-bold">₹{Math.round(h.subtotalRupees)}</span>
          </div>
        ))}
        {plan.instamartHops.map((h, i) => (
          <div key={`i-${i}`} className="flex justify-between gap-2 rounded-lg bg-surface-elevated/50 px-3 py-2">
            <span>{h.note}</span>
            <span className="font-bold">₹{Math.round(h.subtotalRupees)}</span>
          </div>
        ))}
        {plan.warnings.map((w) => (
          <p key={w} className="text-amber">{w}</p>
        ))}
      </CardContent>
    </Card>
  );
}
