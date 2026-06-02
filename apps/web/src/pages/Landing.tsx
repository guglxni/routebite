import {
  ArrowRight,
  ChefHat,
  Clock,
  LayoutDashboard,
  MapPin,
  Navigation,
  Package,
  Route,
  Sparkles,
  Truck,
  UtensilsCrossed,
} from "lucide-react";
import Aurora from "~/components/Aurora";
import BlurText from "~/components/BlurText";
import CountUp from "~/components/CountUp";
import Dock from "~/components/Dock";
import FadeContent from "~/components/FadeContent";
import GradientText from "~/components/GradientText";
import MagicBento from "~/components/MagicBento";
import Particles from "~/components/Particles";
import SpotlightCard from "~/components/SpotlightCard";
import StarBorder from "~/components/StarBorder";
import { MarketingMapDemo } from "~/components/map/MarketingMapDemo";
import { PremiumNavbar } from "~/components/marketing/PremiumNavbar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useProtectedNavigate } from "~/hooks/use-protected-navigate";

const stats = [
  { label: "Avg route distance", value: 17.4, suffix: " km", decimals: 1 },
  { label: "Intercept stops", value: 3, suffix: "" },
  { label: "On-time alignment", value: 94, suffix: "%" },
  { label: "Restaurants per stop", value: 18, suffix: "+" },
];

const steps = [
  { icon: Navigation, label: "Plan your route", desc: "Origin, destination, transport mode — analyzed in seconds." },
  { icon: ChefHat, label: "Pick intercept food", desc: "See scored stops on the map with restaurant density." },
  { icon: Clock, label: "Set timing", desc: "Order now or auto-place for perfect sync." },
  { icon: Truck, label: "Meet on route", desc: "Track rider alignment live as you drive." },
];

export default function Landing() {
  const goProtected = useProtectedNavigate();

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#07070c] pb-28 text-zinc-100">
      <PremiumNavbar />

      {/* Hero */}
      <section className="relative min-h-[92dvh] pt-24">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(245,158,11,0.18),transparent)]" />
          <div className="absolute inset-0 opacity-35">
            <Aurora colorStops={["#78350f", "#f59e0b", "#451a03"]} amplitude={0.85} blend={0.55} />
          </div>
          <div className="absolute inset-0 opacity-50">
            <Particles
              particleCount={120}
              particleSpread={12}
              speed={0.08}
              particleColors={["#f59e0b", "#fbbf24", "#ffffff"]}
              alphaParticles
              particleBaseSize={80}
              className="size-full"
            />
          </div>
          <div
            className="absolute inset-0 opacity-[0.25]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
              backgroundSize: "72px 72px",
              maskImage: "radial-gradient(ellipse 75% 55% at 50% 35%, black, transparent)",
            }}
          />
        </div>

        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8 lg:pt-14">
          <FadeContent blur duration={900} className="flex flex-col gap-6">
            <Badge className="w-fit border-amber/30 bg-amber/10 text-amber-light hover:bg-amber/10">
              <Sparkles className="size-3" />
              Now serving India
            </Badge>

            <h1 className="font-display text-4xl font-normal leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
              <BlurText text="Food that meets you" delay={70} animateBy="words" className="inline" />
              <br />
              <GradientText
                colors={["#fbbf24", "#f59e0b", "#fcd34d", "#d97706"]}
                animationSpeed={6}
                className="font-display text-4xl sm:text-5xl lg:text-[3.4rem]"
              >
                on the way
              </GradientText>
            </h1>

            <p className="max-w-lg text-base leading-relaxed text-zinc-400 sm:text-lg">
              RouteBite analyzes your journey with live traffic, finds intercept stops on a beautiful
              map, and times Swiggy orders so your meal is ready when you arrive.
            </p>

            <div className="flex flex-wrap gap-3">
              <StarBorder
                as="button"
                type="button"
                color="#f59e0b"
                speed="5s"
                className="rounded-xl"
                onClick={() => goProtected("/dashboard")}
              >
                <span className="flex items-center gap-2 px-2 py-0.5 text-sm font-semibold">
                  Start your route
                  <ArrowRight className="size-4" />
                </span>
              </StarBorder>
              <Button
                size="lg"
                variant="outline"
                className="h-[52px] border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06]"
                onClick={() => goProtected("/orders")}
              >
                Track an order
              </Button>
            </div>
          </FadeContent>

          <FadeContent blur delay={150} duration={900}>
            <SpotlightCard
              className="rounded-2xl border border-white/[0.08] bg-[#0c0c14]/80 p-1 shadow-2xl shadow-black/50"
              spotlightColor="rgba(245, 158, 11, 0.14)"
            >
              <div className="rounded-xl border border-white/[0.06] bg-[#0a0a10]/90 p-5">
                <div className="mb-4 flex items-center gap-3 border-b border-white/[0.06] pb-4">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-amber/15">
                    <MapPin className="size-5 text-amber" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">Koramangala → Whitefield</p>
                    <p className="text-xs text-zinc-500">Live route · 3 intercepts · traffic-aware</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 bg-emerald/15 text-emerald-400">
                    Live
                  </Badge>
                </div>
                <div className="flex flex-col gap-2">
                  {[
                    { name: "Toll plaza intercept", score: 92, dwell: "14 min" },
                    { name: "Highway service stop", score: 87, dwell: "11 min" },
                    { name: "Metro corridor pause", score: 81, dwell: "9 min" },
                  ].map((stop) => (
                    <div
                      key={stop.name}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3"
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber/10 text-xs font-bold text-amber">
                        {stop.score}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-200">{stop.name}</p>
                        <p className="text-xs text-zinc-500">{stop.dwell} dwell · 12+ restaurants</p>
                      </div>
                      <UtensilsCrossed className="size-4 shrink-0 text-zinc-600" />
                    </div>
                  ))}
                </div>
              </div>
            </SpotlightCard>
          </FadeContent>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-white/[0.06] bg-[#050508]/80 py-10">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
          {stats.map((s) => (
            <FadeContent key={s.label} threshold={0.2} className="text-center">
              <p className="font-display text-3xl font-normal text-white sm:text-4xl">
                <CountUp
                  to={s.value}
                  duration={2.2}
                  separator=","
                  className="tabular-nums"
                />
                {s.suffix && <span className="text-amber">{s.suffix}</span>}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.15em] text-zinc-500">{s.label}</p>
            </FadeContent>
          ))}
        </div>
      </section>

      {/* Live map demo — mapcn showcase */}
      <section className="relative py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <FadeContent blur className="mb-10 flex flex-col gap-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber/80">mapcn · MapLibre</p>
            <h2 className="font-display text-3xl font-normal text-white sm:text-4xl">
              Routes, arcs, markers & tooltips
            </h2>
            <p className="mx-auto max-w-2xl text-zinc-400">
              The same map stack powers your dashboard — polylines, curved intercept arcs, hover tooltips,
              compass, locate, and fullscreen controls.
            </p>
          </FadeContent>
          <FadeContent blur delay={100}>
            <MarketingMapDemo />
          </FadeContent>
        </div>
      </section>

      {/* Magic Bento platform grid */}
      <section className="border-t border-white/[0.06] bg-[#050508] py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <FadeContent blur className="mb-12 text-center">
            <GradientText
              colors={["#fbbf24", "#ffffff", "#f59e0b"]}
              className="font-display text-3xl sm:text-4xl"
            >
              Platform capabilities
            </GradientText>
            <p className="mx-auto mt-3 max-w-xl text-zinc-400">
              Every card maps to a live backend capability — not mockups.
            </p>
          </FadeContent>
          <FadeContent blur delay={120}>
            <MagicBento
              enableStars
              enableSpotlight
              enableBorderGlow
              enableTilt
              enableMagnetism
              clickEffect
              glowColor="245, 158, 11"
              particleCount={10}
            />
          </FadeContent>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <FadeContent blur className="mb-14 text-center">
            <h2 className="font-display text-3xl font-normal text-white sm:text-4xl">How it works</h2>
            <p className="mx-auto mt-3 max-w-lg text-zinc-400">
              Four steps from route to ready meal — fully wired end to end.
            </p>
          </FadeContent>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <FadeContent key={s.label} delay={i * 80} threshold={0.15}>
                <SpotlightCard
                  className="h-full rounded-2xl border border-white/[0.07] bg-[#0a0a10]/70 p-6"
                  spotlightColor={"rgba(245, 158, 11, 0.1)" as `rgba(${number}, ${number}, ${number}, ${number})`}
                >
                  <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-white/[0.08] bg-amber/10">
                    <s.icon className="size-5 text-amber" />
                  </div>
                  <span className="mb-2 inline-flex size-6 items-center justify-center rounded-full bg-amber/15 text-[10px] font-bold text-amber">
                    {i + 1}
                  </span>
                  <h3 className="mb-2 font-display text-lg text-white">{s.label}</h3>
                  <p className="text-sm leading-relaxed text-zinc-500">{s.desc}</p>
                </SpotlightCard>
              </FadeContent>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-white/[0.06] bg-[#050508] py-24">
        <FadeContent blur className="mx-auto max-w-2xl px-4 text-center">
          <h2 className="font-display text-3xl font-normal text-white sm:text-4xl">
            Stop going out of your way for food
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-zinc-400">
            Plan a route, pick an intercept on the map, order from Swiggy — synced to your drive.
          </p>
          <div className="mt-8 flex justify-center">
            <StarBorder
              as="button"
              type="button"
              color="#fbbf24"
              onClick={() => goProtected("/dashboard")}
            >
              <span className="flex items-center gap-2 px-4 py-1 text-base font-semibold">
                Build your first route
                <ArrowRight className="size-4" />
              </span>
            </StarBorder>
          </div>
        </FadeContent>
      </section>

      {/* Floating dock */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-4">
        <div className="pointer-events-auto">
          <Dock
            panelHeight={56}
            baseItemSize={44}
            magnification={62}
            className="bg-[#0c0c14]/90 backdrop-blur-xl"
            items={[
              {
                icon: <LayoutDashboard className="size-5 text-amber" />,
                label: "Dashboard",
                onClick: () => goProtected("/dashboard"),
              },
              {
                icon: <Route className="size-5 text-sky-400" />,
                label: "Plan route",
                onClick: () => goProtected("/routes/new"),
              },
              {
                icon: <MapPin className="size-5 text-emerald-400" />,
                label: "Intercepts",
                onClick: () => goProtected("/intercepts"),
              },
              {
                icon: <Package className="size-5 text-violet-400" />,
                label: "Orders",
                onClick: () => goProtected("/orders"),
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
