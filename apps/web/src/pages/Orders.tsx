import { useRef, useLayoutEffect, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import gsap from "gsap";
import {
  Package,
  ArrowRight,
  Clock,
  MapPin,
  ChevronDown,
  ChevronUp,
  X,
  CircleDashed,
  Navigation,
} from "lucide-react";
import { useOrders } from "../stores/orders";

const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
  pending: { bg: "bg-amber/10", text: "text-amber", dot: "bg-amber" },
  confirmed: { bg: "bg-sky/10", text: "text-sky", dot: "bg-sky" },
  preparing: { bg: "bg-violet/10", text: "text-violet", dot: "bg-violet" },
  out_for_delivery: { bg: "bg-amber/10", text: "text-amber", dot: "bg-amber" },
  delivered: { bg: "bg-emerald/10", text: "text-emerald", dot: "bg-emerald" },
  cancelled: { bg: "bg-rose/10", text: "text-rose", dot: "bg-rose" },
  failed: { bg: "bg-rose/10", text: "text-rose", dot: "bg-rose" },
};

export default function Orders() {
  const { all, fetchOrders, cancelOrder, loading } = useOrders();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "past">("all");

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useLayoutEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;
    const ctx = gsap.context(() => {
      gsap.from(".order-card", {
        y: 30,
        opacity: 0,
        duration: 0.5,
        stagger: 0.08,
        ease: "expo.out",
      });
    }, ref);
    return () => ctx.revert();
  }, [all, filter]);

  const filtered = all.filter((o) => {
    if (filter === "active") return !["delivered", "cancelled", "failed"].includes(o.status);
    if (filter === "past") return ["delivered", "cancelled", "failed"].includes(o.status);
    return true;
  });

  return (
    <div ref={ref} className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold mb-1">Your Orders</h1>
          <p className="text-text-secondary text-sm">Track and manage your deliveries.</p>
        </div>
        <div className="flex gap-1 p-1 rounded-xl bg-surface-raised border border-border-subtle">
          {(["all", "active", "past"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${
                filter === f ? "bg-amber text-void" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading && all.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <CircleDashed className="w-8 h-8 text-amber animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Package className="w-10 h-10 mx-auto mb-4 text-text-muted" />
          <h3 className="text-lg font-bold mb-2">No orders found</h3>
          <p className="text-sm text-text-muted mb-4">
            {filter === "all" ? "You have not placed any orders yet." : `No ${filter} orders.`}
          </p>
          <Link
            to="/routes/new"
            className="inline-flex items-center gap-1 text-sm font-bold text-amber hover:text-amber-light transition-colors"
          >
            Plan a route <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => {
            const s = statusColors[order.status] ?? statusColors.pending;
            const isExpanded = expandedId === order.id;
            return (
              <div
                key={order.id}
                className="order-card glass rounded-2xl overflow-hidden transition-all"
              >
                <div
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  className="p-5 cursor-pointer hover:bg-surface-raised/40 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-11 h-11 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}>
                      <Package className={`w-5 h-5 ${s.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm truncate">
                          {order.server === "food" ? "Food" : "Instamart"} Order
                        </span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
                          {order.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-text-muted">
                        <span>#{order.id.slice(0, 8)}</span>
                        <span className="w-px h-3 bg-border-subtle" />
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {order.interceptAddress ?? "Intercept point"}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-3">
                      <div className="text-right hidden sm:block">
                        <div className="font-bold text-sm">
                          {order.totalAmount > 0 ? `Rs. ${(order.totalAmount / 100).toFixed(2)}` : "—"}
                        </div>
                        <div className="text-[10px] text-text-muted">
                          {order.timingType === "auto" ? "Auto-timed" : "Immediate"}
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-text-muted" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-text-muted" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-border-subtle">
                    <div className="pt-4 space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 rounded-xl bg-surface-raised/50">
                          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Placed</div>
                          <div className="text-sm font-medium flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-text-muted" />
                            {order.placedAt
                              ? new Date(order.placedAt).toLocaleString()
                              : "Pending auto-place"}
                          </div>
                        </div>
                        <div className="p-3 rounded-xl bg-surface-raised/50">
                          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Swiggy Order</div>
                          <div className="text-sm font-medium">
                            {order.swiggyOrderId ?? "Not placed yet"}
                          </div>
                        </div>
                      </div>

                      {order.autoPlaceAt && (
                        <div className="p-3 rounded-xl bg-amber/5 border border-amber/20">
                          <div className="text-[10px] uppercase tracking-wider text-amber mb-1">Auto-Place At</div>
                          <div className="text-sm font-bold text-amber">
                            {new Date(order.autoPlaceAt).toLocaleString()}
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end gap-3">
                        {!["delivered", "cancelled", "failed"].includes(order.status) && (
                          <button
                            onClick={() => cancelOrder(order.id)}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose hover:bg-rose/10 rounded-lg transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            Cancel
                          </button>
                        )}
                        {order.swiggyOrderId && !["delivered", "cancelled", "failed"].includes(order.status) && (
                          <button
                            onClick={() => navigate(`/track/${order.id}`)}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald hover:bg-emerald/10 rounded-lg transition-colors"
                          >
                            <Navigation className="w-3.5 h-3.5" />
                            Live Track
                          </button>
                        )}
                        {order.swiggyOrderId && (
                          <button
                            onClick={() => window.open(`https://www.swiggy.com/orders/${order.swiggyOrderId}`, "_blank")}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-amber hover:bg-amber/10 rounded-lg transition-colors"
                          >
                            Track on Swiggy <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
