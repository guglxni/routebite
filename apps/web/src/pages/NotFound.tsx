import { Link } from "react-router-dom";
import { MapPin, ArrowRight } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70dvh] flex items-center justify-center px-4">
      <div className="text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-surface-raised border border-border-subtle flex items-center justify-center">
          <MapPin className="w-10 h-10 text-text-muted" />
        </div>
        <h1 className="text-6xl font-extrabold mb-4 text-gradient">404</h1>
        <p className="text-text-secondary mb-8 max-w-sm mx-auto">
          Looks like you wandered off route. Let us get you back on track.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-amber text-void rounded-xl font-bold text-sm hover:bg-amber-light transition-all shadow-lg shadow-amber/20"
        >
          Back to Home <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
