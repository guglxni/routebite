import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import gsap from "gsap";
import { useAuth } from "../stores/auth";

export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setToken } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const state = params.get("state");
  const code = params.get("code");
  const error = params.get("error");

  useEffect(() => {
    if (error) return;
    if (!code) return;

    const doAuth = async () => {
      try {
        const res = await fetch(`/api/v1/auth/callback?code=${code}&state=${state}`, {
          credentials: "include",
        });
        const data = (await res.json()) as { data?: { token: string }; error?: { message: string } };

        if (!res.ok || !data.data?.token) {
          throw new Error(data.error?.message ?? "Auth failed");
        }

        localStorage.setItem("rb_token", data.data.token);
        setToken(data.data.token);

        // Animate success before redirect
        gsap.to(containerRef.current, {
          scale: 0.95,
          opacity: 0,
          duration: 0.4,
          ease: "expo.in",
          onComplete: () => navigate("/dashboard"),
        });
      } catch (e) {
        gsap.fromTo(
          containerRef.current,
          { x: 0 },
          {
            keyframes: [
              { x: -12, duration: 0.1 },
              { x: 12, duration: 0.1 },
              { x: -12, duration: 0.1 },
              { x: 12, duration: 0.1 },
              { x: 0, duration: 0.1 },
            ],
            ease: "power2.inOut",
          }
        );
      }
    };

    doAuth();
  }, [code, error, state, navigate]);

  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div
        ref={containerRef}
        className="glass rounded-2xl p-10 text-center max-w-sm w-full"
      >
        {error ? (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-rose/10 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-rose" />
            </div>
            <h2 className="text-xl font-bold text-text-primary mb-2">Auth Failed</h2>
            <p className="text-sm text-text-secondary">{error}</p>
            <button
              onClick={() => navigate("/")}
              className="mt-6 px-4 py-2 bg-amber text-void rounded-lg text-sm font-bold hover:bg-amber-light transition-colors"
            >
              Back Home
            </button>
          </>
        ) : (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber/10 flex items-center justify-center">
              {code ? (
                <CheckCircle2 className="w-8 h-8 text-amber" />
              ) : (
                <Loader2 className="w-8 h-8 text-amber animate-spin" />
              )}
            </div>
            <h2 className="text-xl font-bold text-text-primary mb-2">
              {code ? "Signing you in..." : "Waiting for auth..."}
            </h2>
            <p className="text-sm text-text-secondary">
              {code
                ? "Almost there. Hang tight."
                : "Complete the Swiggy sign-in to continue."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
