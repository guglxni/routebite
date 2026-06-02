import { cn } from "~/lib/utils";

type RouteBiteLogoProps = {
  className?: string;
  /** Icon-only mark (sidebar collapsed) */
  markOnly?: boolean;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: { box: "size-8", icon: 28, word: "text-base", tag: "text-[9px]" },
  md: { box: "size-9", icon: 32, word: "text-lg", tag: "text-[10px]" },
  lg: { box: "size-11", icon: 40, word: "text-xl", tag: "text-[11px]" },
};

/**
 * Brand logo — transparent PNG in public/. Override with VITE_LOGO_URL if needed.
 */
const LOGO_SRC = (import.meta.env.VITE_LOGO_URL as string | undefined) ?? "/logo-512.png";

export function RouteBiteLogo({ className, markOnly = false, size = "md" }: RouteBiteLogoProps) {
  const s = sizes[size];

  const mark = (
    <img
      src={LOGO_SRC}
      alt="RouteBite"
      className={cn(s.box, "shrink-0 rounded-xl object-contain", className)}
    />
  );

  if (markOnly) return mark;

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {mark}
      <div className="flex flex-col leading-none">
        <span className={cn("font-display font-semibold tracking-tight text-text-primary", s.word)}>
          RouteBite
        </span>
        <span className={cn("font-medium uppercase tracking-[0.18em] text-amber/80", s.tag)}>
          On-route food
        </span>
      </div>
    </div>
  );
}

export function RouteBiteMark({ className, size = "md" }: Omit<RouteBiteLogoProps, "markOnly">) {
  return <RouteBiteLogo markOnly size={size} className={className} />;
}
