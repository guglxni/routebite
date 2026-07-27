import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { haversineMeters } from "@routebite/shared/algorithms";
import {
  Bike,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  Package,
  Radio,
  RefreshCw,
  Undo2,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  claimRiderDelivery,
  getRiderDelivery,
  getRiderDeliveries,
  getRiderHistory,
  getRiderJobs,
  getRiderStats,
  patchRiderFleetLocation,
  patchRiderPresence,
  patchRiderStatus,
  releaseRiderDelivery,
  type RiderDelivery,
  type RiderPresence,
} from "~/lib/api";
import { JourneyMap } from "~/components/map/JourneyMap";
import { PageHeader } from "~/components/dashboard/PageHeader";
import { useLiveLocation } from "~/hooks/use-live-location";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import { DualClockPanel, HaltGateAlert } from "~/components/fusion/FusionPanels";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";

type Detail = Awaited<ReturnType<typeof getRiderDelivery>>;

const STATUS_STEPS = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered"] as const;
/** Dropoffs farther than this are treated as out-of-area (no city-wide map fit / fake ETA). */
const FAR_DROPOFF_M = 80_000;
const MAX_SHOWN_ETA_SEC = 2 * 3600;

function formatEta(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return "—";
  if (sec > MAX_SHOWN_ETA_SEC) return "—";
  if (sec < 60) return `${sec}s`;
  return `${Math.round(sec / 60)} min`;
}

function dropoffDistanceM(
  from: { lat: number; lng: number } | null | undefined,
  d: Pick<RiderDelivery, "dropoff">,
): number | null {
  if (!from || d.dropoff.lat == null || d.dropoff.lng == null) return null;
  return haversineMeters(from, { lat: d.dropoff.lat, lng: d.dropoff.lng });
}

/** Prefer nearest claimed job to rider GPS. Never auto-pick unclaimed/history jobs. */
function pickPreferredJobId(
  mine: RiderDelivery[],
  current: string | null,
  gps: { lat: number; lng: number } | null,
): string | null {
  if (current && mine.some((d) => d.id === current)) return current;
  if (!mine.length) return null;
  if (!gps) return mine[0]?.id ?? null;

  let bestId = mine[0]!.id;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const d of mine) {
    const dist = dropoffDistanceM(gps, d);
    if (dist == null) continue;
    if (dist < bestDist) {
      bestDist = dist;
      bestId = d.id;
    }
  }
  return bestId;
}

const VIEW_COPY = {
  active: {
    eyebrow: "Rider",
    title: "Your shift",
    blurb:
      "Go online to share live GPS, claim intercept dropoffs, navigate, and advance delivery status.",
  },
  available: {
    eyebrow: "Jobs",
    title: "Open for claim",
    blurb: "Unassigned intercept dropoffs. Claim one and it moves into your active queue.",
  },
  history: {
    eyebrow: "Archive",
    title: "Past deliveries",
    blurb: "Completed and cancelled jobs from your account.",
  },
} as const;

function formatInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function DeliveryCard({
  d,
  selected,
  onSelect,
  actions,
}: {
  d: RiderDelivery;
  selected: boolean;
  onSelect: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "w-full cursor-pointer rounded-xl border px-3 py-3 text-left transition-colors",
        selected
          ? "border-sky/50 bg-sky/10"
          : "border-border-subtle bg-surface-raised/40 hover:border-sky/30",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold capitalize">{d.server}</span>
            <Badge variant="outline">{d.status.replace(/_/g, " ")}</Badge>
            <Badge variant="secondary">{formatInr(d.totalAmount)}</Badge>
          </div>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">#{d.id.slice(0, 14)}</p>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-text-secondary">
            <MapPin className="size-3.5 shrink-0 text-amber" />
            <span className="truncate">{d.dropoff.name}</span>
          </p>
          {d.journey && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              Traveler: {d.journey.originAddress} → {d.journey.destAddress}
            </p>
          )}
        </div>
        {actions && <div onClick={(e) => e.stopPropagation()}>{actions}</div>}
      </div>
    </div>
  );
}

export default function RiderDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") ?? "active";
  const setTab = (next: string) => {
    const sp = new URLSearchParams(searchParams);
    sp.set("tab", next);
    setSearchParams(sp, { replace: true });
  };

  const [stats, setStats] = useState<Awaited<ReturnType<typeof getRiderStats>> | null>(null);
  const [available, setAvailable] = useState<RiderDelivery[]>([]);
  const [mine, setMine] = useState<RiderDelivery[]>([]);
  const [history, setHistory] = useState<RiderDelivery[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [presence, setPresence] = useState<RiderPresence>("offline");
  const [lastEta, setLastEta] = useState<number | null>(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const gpsRef = useRef<{ lat: number; lng: number } | null>(null);

  const online = presence === "online" || presence === "busy";

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [s, jobs, my, hist] = await Promise.all([
        getRiderStats(),
        getRiderJobs(),
        getRiderDeliveries("mine"),
        getRiderHistory(),
      ]);
      setStats(s);
      setPresence(s.presence);
      setAvailable(jobs);
      setMine(my);
      setHistory(hist);

      setSelectedId(pickPreferredJobId(my, selectedIdRef.current, gpsRef.current));
    } catch (err) {
      toast.error("Rider feed failed", { description: (err as Error).message });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const d = await getRiderDelivery(id);
      setDetail(d);
      if (d.lastRiderPosition?.eta != null) setLastEta(d.lastRiderPosition.eta);
    } catch (err) {
      toast.error("Could not load job", { description: (err as Error).message });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (!online) return;
    const t = window.setInterval(() => void refresh(true), 15000);
    return () => window.clearInterval(t);
  }, [online, refresh]);

  const onGps = useCallback(async (pos: { lat: number; lng: number }) => {
    try {
      const res = await patchRiderFleetLocation({ lat: pos.lat, lng: pos.lng });
      if (res.riderETA != null) setLastEta(res.riderETA);
      if (selectedIdRef.current) {
        const d = await getRiderDelivery(selectedIdRef.current);
        setDetail(d);
        if (d.lastRiderPosition?.eta != null) setLastEta(d.lastRiderPosition.eta);
      }
    } catch (err) {
      console.warn("[rider] GPS ping failed", err);
    }
  }, []);

  const { position, error: gpsError, watching } = useLiveLocation({
    enabled: online,
    onUpdate: (p) => {
      gpsRef.current = { lat: p.lat, lng: p.lng };
      void onGps({ lat: p.lat, lng: p.lng });
    },
    intervalMs: 15000,
  });

  useEffect(() => {
    if (position) gpsRef.current = { lat: position.lat, lng: position.lng };
  }, [position]);

  // Once GPS is live, prefer a nearby claimed job over a cross-city auto-pick.
  useEffect(() => {
    if (!position || mine.length === 0) return;
    const selected = mine.find((d) => d.id === selectedIdRef.current);
    const selectedDist = selected ? dropoffDistanceM(position, selected) : null;
    if (selected && selectedDist != null && selectedDist <= FAR_DROPOFF_M) return;
    const nearer = pickPreferredJobId(mine, null, position);
    if (nearer && nearer !== selectedIdRef.current) setSelectedId(nearer);
  }, [position, mine]);

  // Leaving Available/History clears preview of unclaimed jobs on Console.
  useEffect(() => {
    if (tab !== "active") return;
    if (selectedId && !mine.some((d) => d.id === selectedId)) {
      setSelectedId(pickPreferredJobId(mine, null, gpsRef.current));
    }
  }, [tab, mine, selectedId]);

  const togglePresence = async () => {
    const next: RiderPresence = online ? "offline" : "online";
    setBusy("presence");
    try {
      const res = await patchRiderPresence(next);
      setPresence(res.presence);
      toast.success(next === "offline" ? "You are offline" : "You are online — sharing GPS");
      await refresh(true);
    } catch (err) {
      toast.error("Presence update failed", { description: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const claim = async (id: string) => {
    setBusy(id);
    try {
      await claimRiderDelivery(id);
      toast.success("Job claimed");
      setTab("active");
      setSelectedId(id);
      await refresh(true);
    } catch (err) {
      toast.error("Claim failed", { description: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const release = async (id: string) => {
    if (!window.confirm("Release this job back to the available pool?")) return;
    setBusy(id);
    try {
      await releaseRiderDelivery(id);
      toast.success("Job released back to pool");
      await refresh(true);
    } catch (err) {
      toast.error("Release failed", { description: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const advance = async (
    id: string,
    status: "preparing" | "out_for_delivery" | "delivered" | "cancelled",
  ) => {
    if (status === "cancelled" && !window.confirm("Cancel this delivery?")) return;
    setBusy(id);
    try {
      await patchRiderStatus(id, status);
      toast.success(`Status → ${status.replace(/_/g, " ")}`);
      await refresh(true);
      if (status !== "delivered" && status !== "cancelled") await loadDetail(id);
      else setDetail(null);
    } catch (err) {
      toast.error("Status update failed", { description: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const mapDest = useMemo(() => {
    const i = detail?.intercept as { lat?: number; lng?: number } | null | undefined;
    if (i?.lat != null && i?.lng != null) return { lat: i.lat, lng: i.lng };
    return null;
  }, [detail]);

  const riderPos = position
    ? { lat: position.lat, lng: position.lng }
    : detail?.lastRiderPosition
      ? { lat: detail.lastRiderPosition.lat, lng: detail.lastRiderPosition.lng }
      : null;

  const dropoffDistM = useMemo(() => {
    if (!riderPos || !mapDest) return null;
    return haversineMeters(riderPos, mapDest);
  }, [riderPos, mapDest]);

  const farDropoff = dropoffDistM != null && dropoffDistM > FAR_DROPOFF_M;

  // Keep map centered on the rider — don't pull India-wide when traveler route/drop is remote.
  const mapOrigin = useMemo(() => {
    if (riderPos) return riderPos;
    if (!farDropoff) {
      const j = detail?.journey as
        | { originLat?: number; originLng?: number }
        | null
        | undefined;
      if (j?.originLat != null && j?.originLng != null) {
        return { lat: j.originLat, lng: j.originLng };
      }
    }
    return null;
  }, [detail, riderPos, farDropoff]);

  // Fit rider+drop when both are local; skip fit for far/single points (use center/zoom).
  const mapFitPoints = useMemo((): { lat: number; lng: number }[] | null => {
    if (farDropoff || !riderPos || !mapDest) return null;
    return [riderPos, mapDest];
  }, [riderPos, mapDest, farDropoff]);

  const displayEta =
    farDropoff || lastEta == null || lastEta > MAX_SHOWN_ETA_SEC ? null : lastEta;

  const orderStatus = String(detail?.order?.status ?? "");
  const stepIndex = STATUS_STEPS.indexOf(orderStatus as (typeof STATUS_STEPS)[number]);

  const navigateHref = useMemo(() => {
    if (!mapDest) return detail?.mapsUrl ?? null;
    const dest = `${mapDest.lat},${mapDest.lng}`;
    if (position) {
      return `https://www.google.com/maps/dir/?api=1&origin=${position.lat},${position.lng}&destination=${dest}&travelmode=driving`;
    }
    return detail?.mapsUrl ?? `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
  }, [detail?.mapsUrl, mapDest, position]);

  const canAdvanceToPreparing =
    detail?.assignedToMe &&
    (orderStatus === "pending" || orderStatus === "confirmed");
  const canAdvanceToOfd =
    detail?.assignedToMe &&
    orderStatus !== "out_for_delivery" &&
    orderStatus !== "delivered" &&
    orderStatus !== "cancelled";
  const canMarkDelivered = detail?.assignedToMe && orderStatus === "out_for_delivery";

  const viewKey = tab === "available" || tab === "history" ? tab : "active";
  const view = VIEW_COPY[viewKey];
  const showConsoleExtras = viewKey === "active";
  const showFarBanner = showConsoleExtras && farDropoff && Boolean(detail?.assignedToMe);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 pb-16">
      <PageHeader
        eyebrow={view.eyebrow}
        title={view.title}
        description={view.blurb}
        actions={
          <>
            <Button
              size="sm"
              variant={online ? "default" : "outline"}
              className={online ? "bg-emerald text-void hover:bg-emerald/90" : ""}
              disabled={busy === "presence"}
              onClick={() => void togglePresence()}
            >
              <Radio className="size-3.5" data-icon="inline-start" />
              {presence === "busy" ? "Busy" : online ? "Online" : "Go online"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
            </Button>
          </>
        }
      />

      {showConsoleExtras && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "My active", value: stats?.activeDeliveries ?? "—", icon: Package },
              { label: "Available", value: stats?.availableJobs ?? "—", icon: Navigation },
              { label: "Delivered", value: stats?.deliveredTotal ?? "—", icon: CheckCircle2 },
              {
                label: "GPS",
                value: watching ? "Live" : online ? "…" : "Off",
                icon: Bike,
              },
            ].map((s) => (
              <Card key={s.label} className="glass border-border-subtle">
                <CardContent className="flex items-center gap-3 p-4">
                  <s.icon className="size-5 text-sky" />
                  <div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                    <div className="text-xl font-bold tabular-nums">{s.value}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {(gpsError || position || (!online && presence === "offline")) && (
            <p className="text-xs text-muted-foreground">
              {gpsError ? (
                <span className="text-rose">{gpsError}</span>
              ) : position ? (
                <>
                  Live · {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
                  {position.accuracy != null && <> · ±{Math.round(position.accuracy)}m</>}
                  {showFarBanner && dropoffDistM != null ? (
                    <> · Far dropoff · {(dropoffDistM / 1000).toFixed(0)} km away</>
                  ) : displayEta != null ? (
                    <> · ETA to drop {formatEta(displayEta)}</>
                  ) : null}
                </>
              ) : (
                "Go online to start live GPS for the fleet and customer tracking."
              )}
            </p>
          )}

          {showFarBanner && (
            <p className="rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-sm text-amber">
              Selected dropoff is{" "}
              {dropoffDistM != null ? `${(dropoffDistM / 1000).toFixed(0)} km` : "very far"} from
              your GPS (likely another city). Map stays on you — pick a nearby job from Available, or
              release this one.
            </p>
          )}
        </>
      )}

      {viewKey === "active" && (
        <div className="grid gap-6 xl:grid-cols-5">
          <div className="xl:col-span-3 flex flex-col gap-4">
            <JourneyMap
              origin={mapOrigin}
              destination={farDropoff ? null : mapDest}
              routePoints={farDropoff ? [] : (detail?.routePoints ?? [])}
              riderPosition={riderPos}
              fitPoints={mapFitPoints}
              zoom={riderPos ? 13 : 11}
              intercepts={
                mapDest && !farDropoff
                  ? [
                      {
                        id: String(detail?.order?.interceptId ?? "drop"),
                        lat: mapDest.lat,
                        lng: mapDest.lng,
                        type: "dynamic",
                        score: Number((detail?.intercept as { score?: number })?.score ?? 70),
                        dwellTime: 180,
                        restaurantCount: 0,
                        safetyRating: 7,
                        name: String((detail?.intercept as { name?: string })?.name ?? "Dropoff"),
                      },
                    ]
                  : []
              }
              showArcs={false}
              showIsochrones={false}
              heightClassName="h-[360px] md:h-[440px]"
            />

            {detail?.assignedToMe && (
              <Card className="glass border-border-subtle">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Active job controls</CardTitle>
                  <CardDescription>
                    #{String(detail.order.id).slice(0, 14)}
                    {typeof detail.amountRupees === "number" && (
                      <> · ₹{detail.amountRupees.toLocaleString("en-IN")}</>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {detail.fusion && (
                    <div className="flex flex-col gap-3">
                      {detail.fusion.riderBrief && (
                        <Alert className="border-amber/20 bg-amber/5">
                          <FileText />
                          <AlertTitle>Traveller brief</AlertTitle>
                          <AlertDescription className="whitespace-pre-wrap text-xs">
                            {detail.fusion.riderBrief}
                          </AlertDescription>
                        </Alert>
                      )}
                      <HaltGateAlert gate={detail.fusion.haltGate} />
                      {detail.fusion.alignment && (
                        <DualClockPanel
                          alignment={{
                            status: detail.fusion.alignment.status,
                            color: detail.fusion.alignment.color,
                            score: detail.fusion.alignment.score,
                            recommendation: detail.fusion.alignment.recommendation,
                          }}
                          dualClock={{
                            clocks: {
                              you: {
                                label: "Customer",
                                etaSeconds: detail.fusion.alignment.customerETA,
                              },
                              rider: {
                                label: "You",
                                etaSeconds: detail.fusion.alignment.riderETA,
                              },
                              kitchen: {
                                label: "Ready",
                                etaSeconds: detail.fusion.alignment.orderReadyTime ?? null,
                              },
                            },
                          }}
                        />
                      )}
                      {detail.fusion.mealQueryHint && (
                        <p className="text-[11px] text-muted-foreground">
                          Meal context: {detail.fusion.mealQueryHint}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_STEPS.map((s, i) => (
                      <Badge
                        key={s}
                        variant={i <= stepIndex ? "default" : "outline"}
                        className={cn(
                          "capitalize",
                          i <= stepIndex && "bg-sky/20 text-sky border-sky/30",
                        )}
                      >
                        {s.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {canAdvanceToPreparing && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === selectedId}
                        onClick={() => selectedId && void advance(selectedId, "preparing")}
                      >
                        Mark preparing
                      </Button>
                    )}
                    {canAdvanceToOfd && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy === selectedId}
                        onClick={() =>
                          selectedId && void advance(selectedId, "out_for_delivery")
                        }
                      >
                        Out for delivery
                      </Button>
                    )}
                    {canMarkDelivered && (
                      <Button
                        size="sm"
                        className="bg-amber text-void hover:bg-amber-light"
                        disabled={busy === selectedId}
                        onClick={() => selectedId && void advance(selectedId, "delivered")}
                      >
                        Mark delivered
                      </Button>
                    )}
                    {navigateHref && (
                      <a
                        href={navigateHref}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-border-subtle px-2.5 text-[0.8rem] hover:bg-muted"
                      >
                        <ExternalLink className="size-3.5" />
                        Navigate
                      </a>
                    )}
                    {orderStatus !== "delivered" && orderStatus !== "cancelled" && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === selectedId}
                          onClick={() => selectedId && void release(selectedId)}
                        >
                          <Undo2 className="size-3.5" data-icon="inline-start" />
                          Release
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy === selectedId}
                          onClick={() => selectedId && void advance(selectedId, "cancelled")}
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="xl:col-span-2">
            <Card className="glass border-border-subtle">
              <CardHeader>
                <CardTitle>Active queue</CardTitle>
                <CardDescription>
                  {mine.length
                    ? "Your claimed jobs"
                    : "No claimed jobs — open Available to claim a dropoff"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {mine.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                      Claim an intercept dropoff to start a delivery.
                    </p>
                    <Button size="sm" onClick={() => setTab("available")}>
                      Browse available
                    </Button>
                  </div>
                ) : (
                  mine.map((d) => (
                    <DeliveryCard
                      key={d.id}
                      d={d}
                      selected={selectedId === d.id}
                      onSelect={() => setSelectedId(d.id)}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {viewKey === "available" && (
        <Card className="glass border-border-subtle">
          <CardHeader>
            <CardTitle>Open jobs ({available.length})</CardTitle>
            <CardDescription>
              Sorted as returned by the API. Claim assigns the order to you.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Loading jobs…</p>
            ) : available.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No unassigned jobs. Traveler orders with intercepts show up here.
              </p>
            ) : (
              available.map((d) => {
                const dist = dropoffDistanceM(position, d);
                const far = dist != null && dist > FAR_DROPOFF_M;
                return (
                  <DeliveryCard
                    key={d.id}
                    d={d}
                    selected={selectedId === d.id}
                    onSelect={() => setSelectedId(d.id)}
                    actions={
                      <div className="flex flex-col items-end gap-1">
                        {dist != null && (
                          <span
                            className={cn(
                              "text-[10px] tabular-nums",
                              far ? "text-amber" : "text-muted-foreground",
                            )}
                          >
                            {(dist / 1000).toFixed(far ? 0 : 1)} km
                          </span>
                        )}
                        <Button
                          size="sm"
                          className="bg-sky text-void hover:bg-sky/90"
                          disabled={busy === d.id}
                          onClick={() => void claim(d.id)}
                        >
                          Claim
                        </Button>
                      </div>
                    }
                  />
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      {viewKey === "history" && (
        <Card className="glass border-border-subtle">
          <CardHeader>
            <CardTitle>Past deliveries ({history.length})</CardTitle>
            <CardDescription>Delivered and cancelled jobs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Loading history…</p>
            ) : history.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Completed deliveries will appear here.
              </p>
            ) : (
              history.map((d) => (
                <DeliveryCard
                  key={d.id}
                  d={d}
                  selected={selectedId === d.id}
                  onSelect={() => setSelectedId(d.id)}
                />
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
