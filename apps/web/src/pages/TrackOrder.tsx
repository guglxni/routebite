import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import gsap from "gsap";
import {
  Navigation,
  MapPin,
  Clock,
  Bike,
  Activity,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  CircleDashed,
  Crosshair,
  User,
  Car,
} from "lucide-react";
import { useTracking } from "../stores/tracking";
import CountUp from "~/components/CountUp";
import SpotlightCard from "~/components/SpotlightCard";
import { JourneyMap } from "~/components/map/JourneyMap";
import { LiveLocationPanel } from "~/components/journey/LiveLocationPanel";
import { patchJourneyTelemetry } from "~/lib/api";
import type { GPSPosition } from "@routebite/shared/types";
import {
  DeferredPlaceCard,
  DualClockPanel,
  ReInterceptBanner,
} from "~/components/fusion/FusionPanels";
import { useNavigate } from "react-router-dom";
import { executeReIntercept } from "~/lib/api";
import { toast } from "sonner";
import { useCart } from "~/stores/cart";

function formatETA(seconds?: number): string {
  if (seconds === undefined || seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  }
  return `${m}m ${s}s`;
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export default function TrackOrder() {
  const navigate = useNavigate();
  const cart = useCart();
  const { orderId } = useParams<{ orderId: string }>();
  const {
    snapshot,
    history,
    loading,
    error,
    polling,
    fetchTrack,
    fetchHistory,
    startPolling,
    stopPolling,
  } = useTracking();
  const mapRef = useRef<HTMLDivElement>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [shareLocation, setShareLocation] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    fetchTrack(orderId);
    fetchHistory(orderId);
    startPolling(orderId);
    return () => {
      stopPolling();
    };
  }, [orderId, fetchTrack, fetchHistory, startPolling, stopPolling]);

  // Entrance animation
  useEffect(() => {
    if (!mapRef.current || loading) return;
    const ctx = gsap.context(() => {
      gsap.from(".track-card", {
        y: 24,
        opacity: 0,
        duration: 0.5,
        stagger: 0.1,
        ease: "expo.out",
      });
    }, mapRef);
    return () => ctx.revert();
  }, [loading, snapshot]);

  const alignment = snapshot?.alignmentStatus;
  const rider = snapshot?.riderPosition;
  const customerContext = snapshot?.customerContext;
  const customerPosition = customerContext?.customerPosition;
  const interceptPoint = customerContext?.intercept;
  const journeyId = customerContext?.journeyId;
  const hasData = !!(snapshot && (snapshot.swiggyOrderId !== null || snapshot.deferred));
  const dualClock = snapshot?.dualClock;
  const reIntercept = snapshot?.reIntercept;
  const deferred = snapshot?.deferred;

  useEffect(() => {
    if (customerContext?.liveLocationSharing) {
      setShareLocation(true);
    }
  }, [customerContext?.liveLocationSharing]);

  const onTrackLocation = async (position: GPSPosition) => {
    if (!journeyId) return;
    try {
      await patchJourneyTelemetry(journeyId, {
        liveLocation: position,
        liveLocationSharing: true,
      });
      if (orderId) fetchTrack(orderId);
    } catch {
      // Non-blocking — next poll will still use last known if PATCH fails
    }
  };

  const onShareToggle = async (enabled: boolean) => {
    setShareLocation(enabled);
    if (!journeyId) return;
    try {
      await patchJourneyTelemetry(journeyId, { liveLocationSharing: enabled });
      if (orderId) fetchTrack(orderId);
    } catch {
      // ignore
    }
  };

  // Render live map with rider + customer + intercept
  const renderLiveMap = () => {
    const riderPos = snapshot?.riderPosition;
    const intercept = interceptPoint;
    const fallbackCenter = riderPos ?? customerPosition;

    if (!fallbackCenter && !intercept) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          <MapPin className="mr-1.5 size-4" />
          Waiting for rider location…
        </div>
      );
    }

    const origin = customerPosition ?? intercept ?? fallbackCenter!;
    const destination = intercept ?? fallbackCenter!;

    return (
      <JourneyMap
        riderPosition={riderPos ? { lat: riderPos.lat, lng: riderPos.lng } : undefined}
        customerPosition={customerPosition ?? null}
        origin={{ lat: origin.lat, lng: origin.lng }}
        destination={{ lat: destination.lat, lng: destination.lng }}
        intercepts={
          intercept
            ? [
                {
                  id: intercept.id,
                  lat: intercept.lat,
                  lng: intercept.lng,
                  type: "dynamic",
                  score: 100,
                  dwellTime: 0,
                  restaurantCount: 0,
                  safetyRating: 5,
                  name: intercept.name ?? "Intercept",
                },
              ]
            : []
        }
        selectedInterceptId={intercept?.id}
        showArcs={false}
        heightClassName="h-full min-h-[320px]"
        className="h-full border-0 rounded-none"
      />
    );
  };

  return (
    <div ref={mapRef} className="max-w-5xl mx-auto px-4 sm:px-6 py-8 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            to="/orders"
            className="p-2 rounded-lg hover:bg-surface-raised transition-colors text-text-muted hover:text-text-primary"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber">Tracking</p>
            <h1 className="font-display text-2xl leading-tight tracking-tight text-text-primary md:text-[1.85rem]">
              Live on the map
            </h1>
            <p className="text-sm text-text-muted">Order #{orderId?.slice(0, 8)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {polling && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald bg-emerald/10 px-2 py-1 rounded-full">
              <Crosshair className="w-3 h-3" />
              Live
            </span>
          )}
          <button
            onClick={() => orderId && fetchTrack(orderId)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-amber hover:bg-amber/10 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading && !snapshot ? (
        <div className="flex items-center justify-center py-24">
          <CircleDashed className="w-8 h-8 text-amber animate-spin" />
        </div>
      ) : error ? (
        <div className="glass rounded-2xl p-8 text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-3 text-rose" />
          <h3 className="font-bold mb-1">Tracking unavailable</h3>
          <p className="text-sm text-text-muted">{error}</p>
        </div>
      ) : !hasData ? (
        <div className="glass rounded-2xl p-8 text-center">
          <Clock className="w-8 h-8 mx-auto mb-3 text-text-muted" />
          <h3 className="font-bold mb-1">Not yet placed</h3>
          <p className="text-sm text-text-muted">
            This order hasn&apos;t been sent to Swiggy yet. Check back after placement.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {deferred && !snapshot?.swiggyOrderId && (
            <div className="lg:col-span-3 track-card">
              <DeferredPlaceCard deferred={deferred} />
            </div>
          )}
          <div className="lg:col-span-3 track-card flex flex-col gap-3">
            <DualClockPanel dualClock={dualClock} alignment={alignment} />
            <ReInterceptBanner
              suggestion={reIntercept ?? null}
              onSwitch={(id) => {
                if (!orderId) return;
                void (async () => {
                  try {
                    const res = await executeReIntercept(orderId, {
                      newInterceptId: id,
                      flushCart: true,
                    });
                    cart.clearCart();
                    cart.setInterceptId(id);
                    toast.success(res.message);
                    navigate(`/menu?interceptsId=${id}&server=food`);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Re-intercept failed");
                  }
                })();
              }}
            />
          </div>
          {/* Main map card */}
          <div className="track-card lg:col-span-2 glass rounded-2xl overflow-hidden border border-border-subtle">
            <div className="p-4 border-b border-border-subtle flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-amber" />
                <span className="text-sm font-bold">GPS View</span>
              </div>
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-raised text-text-muted"
              >
                {statusLabel(snapshot!.status)}
              </span>
            </div>
            <div className="relative h-80 bg-void/40">{renderLiveMap()}</div>
          </div>

          {/* Stats column */}
          <div className="space-y-3">
            {/* Alignment score */}
            <div className="track-card">
            <SpotlightCard
              className="rounded-2xl border border-border-subtle bg-surface-raised/20 p-4"
              spotlightColor="rgba(245, 158, 11, 0.08)"
            >
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-text-muted" />
                <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Alignment</span>
              </div>
              {alignment ? (
                <div>
                  <div className="flex items-end gap-2 mb-2">
                    <span
                      className="text-3xl font-extrabold tabular-nums"
                      style={{ color: alignment.color }}
                    >
                      <CountUp to={alignment.score} duration={1.2} />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: alignment.color }}>
                      {alignment.status}
                    </span>
                  </div>
                  <div className="text-xs text-text-secondary leading-relaxed">
                    {alignment.recommendation}
                  </div>
                  {alignment.riderOutsideIsochrone && (
                    <div className="mt-2 rounded-lg border border-rose/30 bg-rose/10 px-2.5 py-1.5 text-[11px] font-medium text-rose">
                      Rider is outside the delivery reachability zone for this intercept.
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-text-muted">Computing...</div>
              )}
            </SpotlightCard>
            </div>

            {journeyId && (
              <div className="track-card">
                <LiveLocationPanel
                  enabled={shareLocation}
                  onEnabledChange={onShareToggle}
                  onLocation={onTrackLocation}
                />
              </div>
            )}

            {/* ETAs */}
            <div className="track-card glass rounded-2xl p-4 border border-border-subtle">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-text-muted" />
                <span className="text-xs font-bold uppercase tracking-wider text-text-muted">ETAs</span>
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-text-secondary">Your arrival</span>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-sm font-bold text-sky">{formatETA(snapshot?.customerETA)}</span>
                    {customerContext?.etaFromLiveGps ? (
                      <span className="rounded-md border border-emerald/30 bg-emerald/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald">
                        Live GPS · traffic
                      </span>
                    ) : (
                      <span className="text-[9px] font-medium uppercase tracking-wider text-text-muted">
                        Schedule / last known
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Rider arrival</span>
                  <span className="text-sm font-bold text-amber">{formatETA(snapshot?.riderETA)}</span>
                </div>
                {alignment && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Order ready</span>
                    <span className="text-sm font-bold text-emerald">{formatETA(alignment.orderReadyTime)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Rider sees — delivery partner instructions */}
            {customerContext && (
              <div className="track-card glass rounded-2xl p-4 border border-border-subtle">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-text-muted" />
                  <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Rider sees</span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
                  {customerContext.riderBrief}
                </p>
                {customerContext.vehicleDetails && (
                  <div className="mt-3 pt-3 border-t border-border-subtle space-y-1.5">
                    {customerContext.vehicleDetails.plateNumber && (
                      <div className="flex items-center gap-2 text-xs text-text-secondary">
                        <Car className="w-3.5 h-3.5 shrink-0" />
                        <span>{customerContext.vehicleDetails.plateNumber}</span>
                      </div>
                    )}
                    {customerContext.vehicleDetails.trainNumber && (
                      <div className="flex items-center gap-2 text-xs text-text-secondary">
                        <span className="font-mono">{customerContext.vehicleDetails.trainNumber}</span>
                        {customerContext.vehicleDetails.coach && (
                          <span>· Coach {customerContext.vehicleDetails.coach}</span>
                        )}
                      </div>
                    )}
                    {customerContext.liveLocationSharing && (
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald">
                        <Crosshair className="w-3 h-3" />
                        Live GPS shared
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Rider position */}
            {rider && (
              <div className="track-card glass rounded-2xl p-4 border border-border-subtle">
                <div className="flex items-center gap-2 mb-2">
                  <Bike className="w-4 h-4 text-text-muted" />
                  <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Rider Location</span>
                </div>
                <div className="font-mono text-xs text-text-secondary">
                  {rider.lat.toFixed(6)}
                  <br />
                  {rider.lng.toFixed(6)}
                </div>
              </div>
            )}

            {/* History sparkline */}
            {history.length > 0 && (
              <div className="track-card glass rounded-2xl p-4 border border-border-subtle">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="w-4 h-4 text-text-muted" />
                  <span className="text-xs font-bold uppercase tracking-wider text-text-muted">History</span>
                </div>
                <div className="flex items-end gap-0.5 h-10">
                  {history
                    .slice(0, 20)
                    .reverse()
                    .map((ev) => {
                      const score = ev.alignmentScore ?? 0;
                      const h = Math.max(4, score * 40);
                      return (
                        <div
                          key={ev.id}
                          className="flex-1 rounded-sm"
                          style={{
                            height: `${h}px`,
                            backgroundColor:
                              score > 0.8 ? "#10B981" : score > 0.5 ? "#0EA5E9" : "#F59E0B",
                            opacity: 0.8,
                          }}
                          title={`Score: ${(score * 100).toFixed(0)}`}
                        />
                      );
                    })}
                </div>
                <div className="flex justify-between text-[10px] text-text-muted mt-1">
                  <span>{history.length} snapshots</span>
                  <span>Latest</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Debug raw data toggle */}
      {!!snapshot?.raw && (
        <div className="mt-4">
          <button
            onClick={() => setShowRaw((s) => !s)}
            className="text-[10px] font-bold uppercase tracking-wider text-text-muted hover:text-text-primary transition-colors"
          >
            {showRaw ? "Hide" : "Show"} Raw Response
          </button>
          {showRaw && (
            <pre className="mt-2 p-3 rounded-xl bg-void border border-border-subtle text-[10px] text-text-muted overflow-auto max-h-64">
              {JSON.stringify(snapshot.raw, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
