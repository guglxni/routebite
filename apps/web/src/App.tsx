import { Routes, Route, Navigate, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { TooltipProvider } from "~/components/ui/tooltip";
import { Toaster } from "~/components/ui/sonner";
import { Layout } from "./components/Layout";
import { DashboardShell } from "./components/dashboard/DashboardShell";
import { useAuth } from "./stores/auth";
import Landing from "./pages/Landing";
import AuthCallback from "./pages/AuthCallback";
import Dashboard from "./pages/Dashboard";
import RouteBuilder from "./pages/RouteBuilder";
import Intercepts from "./pages/Intercepts";
import Menu from "./pages/Menu";
import Order from "./pages/Order";
import Orders from "./pages/Orders";
import TrackOrder from "./pages/TrackOrder";
import NotFound from "./pages/NotFound";

function TokenCapture({ children }: { children: React.ReactNode }) {
  const [sp] = useSearchParams();
  const { setToken } = useAuth();
  const token = sp.get("token");

  useEffect(() => {
    if (token) {
      localStorage.setItem("rb_token", token);
      setToken(token);
    }
  }, [token, setToken]);

  return <>{children}</>;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, hydrated } = useAuth();
  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-void text-zinc-400 text-sm">
        Loading session…
      </div>
    );
  }
  if (!token) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <TooltipProvider>
      <TokenCapture>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

            <Route
              element={
                <RequireAuth>
                  <DashboardShell />
                </RequireAuth>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/routes/new" element={<RouteBuilder />} />
              <Route path="/intercepts" element={<Intercepts />} />
              <Route path="/menu" element={<Menu />} />
              <Route path="/order" element={<Order />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/track/:orderId" element={<TrackOrder />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </TokenCapture>
      <Toaster richColors position="top-right" theme="dark" />
    </TooltipProvider>
  );
}
