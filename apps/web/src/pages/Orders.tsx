import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ChevronRight,
  CircleDashed,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Package,
  ShoppingBag,
  UtensilsCrossed,
  X,
} from "lucide-react";
import AnimatedContent from "~/components/AnimatedContent";
import SpotlightCard from "~/components/SpotlightCard";
import { PageHeader } from "~/components/dashboard/PageHeader";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";
import { useOrders } from "~/stores/orders";

const statusStyles: Record<
  string,
  { label: string; badge: string; dot: string; iconBg: string }
> = {
  pending: {
    label: "Pending",
    badge: "border-amber/30 bg-amber/10 text-amber",
    dot: "bg-amber",
    iconBg: "bg-amber/15 text-amber",
  },
  confirmed: {
    label: "Confirmed",
    badge: "border-sky/30 bg-sky/10 text-sky",
    dot: "bg-sky",
    iconBg: "bg-sky/15 text-sky",
  },
  preparing: {
    label: "Preparing",
    badge: "border-violet/30 bg-violet/10 text-violet",
    dot: "bg-violet",
    iconBg: "bg-violet/15 text-violet",
  },
  out_for_delivery: {
    label: "Out for delivery",
    badge: "border-amber/30 bg-amber/10 text-amber-light",
    dot: "bg-amber",
    iconBg: "bg-amber/15 text-amber",
  },
  delivered: {
    label: "Delivered",
    badge: "border-emerald/30 bg-emerald/10 text-emerald",
    dot: "bg-emerald",
    iconBg: "bg-emerald/15 text-emerald",
  },
  cancelled: {
    label: "Cancelled",
    badge: "border-rose/30 bg-rose/10 text-rose",
    dot: "bg-rose",
    iconBg: "bg-rose/15 text-rose",
  },
  failed: {
    label: "Failed",
    badge: "border-rose/30 bg-rose/10 text-rose",
    dot: "bg-rose",
    iconBg: "bg-rose/15 text-rose",
  },
};

function formatAmount(paise: number) {
  if (!paise || paise <= 0) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function isActiveStatus(status: string) {
  return !["delivered", "cancelled", "failed"].includes(status);
}

export default function Orders() {
  const { all, fetchOrders, cancelOrder, loading } = useOrders();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "active" | "past">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const filtered = useMemo(() => {
    return all.filter((o) => {
      if (filter === "active") return isActiveStatus(o.status);
      if (filter === "past") return !isActiveStatus(o.status);
      return true;
    });
  }, [all, filter]);

  const counts = useMemo(
    () => ({
      all: all.length,
      active: all.filter((o) => isActiveStatus(o.status)).length,
      past: all.filter((o) => !isActiveStatus(o.status)).length,
    }),
    [all],
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 pb-24">
      <PageHeader
        eyebrow="Orders"
        title="Your deliveries"
        description="Track and manage orders timed to your journey intercepts."
        actions={
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList className="h-auto flex-wrap gap-1 bg-surface-raised/80 p-1">
              {(["all", "active", "past"] as const).map((key) => (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="capitalize data-[state=active]:bg-amber data-[state=active]:text-void"
                >
                  {key}
                  <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums">
                    {counts[key]}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />

      {loading && all.length === 0 ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-amber" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-border-subtle bg-surface-raised/30">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-amber/10">
              <Package className="size-7 text-amber" />
            </div>
            <div>
              <h3 className="text-lg font-bold">No orders found</h3>
              <p className="mt-1 max-w-sm text-sm text-text-muted">
                {filter === "all"
                  ? "Plan a route, pick an intercept, and place your first order."
                  : `No ${filter} orders right now.`}
              </p>
            </div>
            <Button className="bg-amber text-void hover:bg-amber-light" render={<Link to="/routes/new" />}>
              Plan a route
              <ArrowRight className="size-4" data-icon="inline-end" />
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((order, index) => {
            const style = statusStyles[order.status] ?? statusStyles.pending;
            const amount = formatAmount(order.totalAmount);
            const expanded = expandedId === order.id;
            const ServerIcon = order.server === "food" ? UtensilsCrossed : ShoppingBag;

            return (
              <AnimatedContent key={order.id} distance={32} delay={index * 0.04}>
                <SpotlightCard
                  className={cn(
                    "overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised/40",
                    expanded && "ring-1 ring-amber/20",
                  )}
                  spotlightColor="rgba(245, 158, 11, 0.07)"
                >
                  <div className="flex flex-col gap-4 p-5">
                    <div className="flex items-start gap-4">
                      <div
                        className={cn(
                          "flex size-12 shrink-0 items-center justify-center rounded-xl",
                          style.iconBg,
                        )}
                      >
                        <ServerIcon className="size-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-text-primary">
                            {order.server === "food" ? "Food order" : "Instamart order"}
                          </h3>
                          <Badge variant="outline" className={cn("font-medium", style.badge)}>
                            <span className={cn("mr-1.5 inline-block size-1.5 rounded-full", style.dot)} />
                            {style.label}
                          </Badge>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                          <span className="font-mono">#{order.id.slice(0, 8)}</span>
                          <span className="hidden sm:inline text-border-medium">·</span>
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <MapPin className="size-3 shrink-0" />
                            <span className="truncate">
                              {order.interceptAddress ?? "Intercept point"}
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className="hidden shrink-0 text-right sm:block">
                        {amount ? (
                          <p className="text-lg font-bold tabular-nums">{amount}</p>
                        ) : (
                          <p className="text-sm text-text-muted">—</p>
                        )}
                        <p className="text-[11px] text-text-muted">
                          {order.timingType === "auto" ? "Auto-timed" : "Immediate"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
                      {order.swiggyOrderId && isActiveStatus(order.status) && (
                        <Button
                          size="sm"
                          className="bg-amber text-void hover:bg-amber-light"
                          onClick={() => navigate(`/track/${order.id}`)}
                        >
                          <Navigation className="size-3.5" data-icon="inline-start" />
                          Live track
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        className="border-border-subtle"
                        onClick={() => setExpandedId(expanded ? null : order.id)}
                      >
                        {expanded ? "Hide details" : "Details"}
                        <ChevronRight
                          className={cn("size-3.5 transition-transform", expanded && "rotate-90")}
                          data-icon="inline-end"
                        />
                      </Button>

                      {!isActiveStatus(order.status) && order.swiggyOrderId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-text-muted"
                          onClick={() =>
                            window.open(`https://www.swiggy.com/orders/${order.swiggyOrderId}`, "_blank")
                          }
                        >
                          Swiggy receipt
                          <ArrowRight className="size-3.5" data-icon="inline-end" />
                        </Button>
                      )}
                    </div>

                    {expanded && (
                      <div className="grid gap-3 border-t border-border-subtle pt-4 sm:grid-cols-2">
                        <div className="rounded-xl border border-border-subtle bg-void/40 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                            Placed
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-sm">
                            <Clock className="size-3.5 text-text-muted" />
                            {order.placedAt
                              ? new Date(order.placedAt).toLocaleString("en-IN")
                              : "Pending auto-place"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border-subtle bg-void/40 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                            Swiggy ID
                          </p>
                          <p className="mt-1 truncate font-mono text-sm">
                            {order.swiggyOrderId ?? "Not placed yet"}
                          </p>
                        </div>

                        {order.autoPlaceAt && (
                          <div className="rounded-xl border border-amber/20 bg-amber/5 p-3 sm:col-span-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber">
                              Auto-place at
                            </p>
                            <p className="mt-1 text-sm font-semibold text-amber-light">
                              {new Date(order.autoPlaceAt).toLocaleString("en-IN")}
                            </p>
                          </div>
                        )}

                        {isActiveStatus(order.status) && (
                          <div className="flex flex-wrap gap-2 sm:col-span-2 sm:justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-rose/30 text-rose hover:bg-rose/10"
                              onClick={() => cancelOrder(order.id)}
                            >
                              <X className="size-3.5" data-icon="inline-start" />
                              Cancel order
                            </Button>
                            {order.swiggyOrderId && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  window.open(
                                    `https://www.swiggy.com/orders/${order.swiggyOrderId}`,
                                    "_blank",
                                  )
                                }
                              >
                                Open in Swiggy
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </SpotlightCard>
              </AnimatedContent>
            );
          })}
        </div>
      )}

      {loading && all.length > 0 && (
        <div className="flex items-center justify-center gap-2 text-xs text-text-muted">
          <CircleDashed className="size-3.5 animate-spin" />
          Refreshing orders…
        </div>
      )}
    </div>
  );
}
