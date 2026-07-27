import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

type PageHeaderProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/** Shared portal page title — Instrument Serif display, no gimmick gradients. */
export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 max-w-2xl space-y-2">
        {eyebrow ? (
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-[2rem] leading-[1.15] tracking-tight text-text-primary md:text-[2.65rem]">
          {title}
        </h1>
        {description ? (
          <div className="max-w-xl text-sm leading-relaxed text-text-secondary">{description}</div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
