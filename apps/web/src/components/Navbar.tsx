import { useRef, useLayoutEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Map, Home, User, LogOut, MenuIcon, X, ShoppingCart } from "lucide-react";
import gsap from "gsap";
import { useAuth } from "../stores/auth";

export function Navbar() {
  const { user, logout, login } = useAuth();
  const loc = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const ctx = gsap.context(() => {
      gsap.from(ref.current!, {
        y: -20,
        opacity: 0,
        duration: 0.5,
        ease: "expo.out",
      });
    });
    return () => ctx.revert();
  }, []);

  const links = [
    { to: "/", label: "Home", icon: Home },
    { to: "/dashboard", label: "Dashboard", icon: Map },
    { to: "/orders", label: "Orders", icon: ShoppingCart },
  ];

  const isActive = (path: string) => loc.pathname === path;

  return (
    <nav
      ref={ref}
      className="fixed top-0 left-0 right-0 z-50 glass border-b border-border-subtle"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-amber rounded-lg flex items-center justify-center glow-amber transition-all duration-300 group-hover:glow-amber-strong">
              <Map className="w-4 h-4 text-void" />
            </div>
            <span className="font-bold text-lg tracking-tight text-gradient">
              RouteBite
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={`relative px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 flex items-center gap-1.5 ${
                  isActive(l.to)
                    ? "text-amber-light bg-surface-raised"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-raised/50"
                }`}
              >
                <l.icon className="w-4 h-4" />
                {l.label}
                {isActive(l.to) && (
                  <span className="absolute bottom-0 left-3 right-3 h-px bg-amber" />
                )}
              </Link>
            ))}

            {user ? (
              <div className="flex items-center gap-2 ml-4 pl-4 border-l border-border-subtle">
                <div className="w-8 h-8 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center">
                  <User className="w-4 h-4 text-text-secondary" />
                </div>
                <button
                  onClick={logout}
                  className="p-2 rounded-lg text-text-secondary hover:text-rose hover:bg-rose/10 transition-colors"
                  aria-label="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={login}
                className="ml-4 px-4 py-2 bg-amber text-void rounded-lg text-sm font-bold hover:bg-amber-light transition-all duration-200 hover:shadow-lg shadow-amber/20"
              >
                Get Started
              </button>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-border-subtle bg-surface-deep/95 backdrop-blur-xl">
          <div className="px-4 py-3 space-y-1">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${
                  isActive(l.to)
                    ? "text-amber bg-surface-raised"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-raised/50"
                }`}
              >
                <l.icon className="w-4 h-4" />
                {l.label}
              </Link>
            ))}
            {user ? (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-rose hover:bg-rose/10 transition-colors"
              >
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            ) : (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  login();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-amber text-void rounded-lg text-sm font-bold"
              >
                Get Started
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
