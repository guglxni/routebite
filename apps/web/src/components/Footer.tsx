import { Map, ExternalLink } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border-subtle bg-void-deep">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-amber rounded-md flex items-center justify-center">
              <Map className="w-3.5 h-3.5 text-void" />
            </div>
            <span className="font-bold text-lg text-gradient">RouteBite</span>
          </div>
          <p className="text-sm text-text-muted">
            Food that meets you on the way. No extra stops, no extra time.
          </p>
          <div className="flex items-center gap-4">
            <a
              href="#"
              className="w-9 h-9 rounded-lg bg-surface-raised flex items-center justify-center text-text-muted hover:text-amber transition-colors"
              aria-label="GitHub"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <a
              href="#"
              className="w-9 h-9 rounded-lg bg-surface-raised flex items-center justify-center text-text-muted hover:text-sky transition-colors"
              aria-label="Social"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-border-subtle text-center text-xs text-text-muted">
          {new Date().getFullYear()} RouteBite. Built with care.
        </div>
      </div>
    </footer>
  );
}
