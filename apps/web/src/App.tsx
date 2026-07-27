import { Routes, Route, Navigate, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { Activity, Bike, Navigation, Package, Shield, Users } from "lucide-react";
import { TooltipProvider } from "~/components/ui/tooltip";
import { Toaster } from "~/components/ui/sonner";
import { Layout } from "./components/Layout";
import { DashboardShell } from "./components/dashboard/DashboardShell";
import { RoleShell } from "./components/dashboard/RoleShell";
import { RequireRole } from "./components/auth/RequireRole";
import { useAuth } from "./stores/auth";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import Dashboard from "./pages/Dashboard";
import RouteBuilder from "./pages/RouteBuilder";
import Intercepts from "./pages/Intercepts";
import Menu from "./pages/Menu";
import Order from "./pages/Order";
import Orders from "./pages/Orders";
import TrackOrder from "./pages/TrackOrder";
import RiderDashboard from "./pages/rider/RiderDashboard";
import AdminDashboard from "./pages/admin/AdminDashboard";
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

const riderNav = [
  { to: "/rider?tab=active", label: "Console", icon: Bike },
  { to: "/rider?tab=available", label: "Available", icon: Package },
  { to: "/rider?tab=history", label: "History", icon: Navigation },
];
const adminNav = [
  { to: "/admin", label: "Overview", icon: Shield },
  { to: "/admin?tab=orders", label: "Orders", icon: Package },
  { to: "/admin?tab=users", label: "Users", icon: Users },
  { to: "/admin?tab=system", label: "System", icon: Activity },
];

export default function App() {
  return (
    <TooltipProvider>
      <TokenCapture>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* Traveler portal — isolated */}
            <Route
              element={
                <RequireRole roles={["user"]}>
                  <DashboardShell />
                </RequireRole>
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

            {/* Rider portal — isolated */}
            <Route
              element={
                <RequireRole roles={["rider"]}>
                  <RoleShell
                    role="rider"
                    title="Rider"
                    subtitle="Delivery console"
                    navItems={riderNav}
                  />
                </RequireRole>
              }
            >
              <Route path="/rider" element={<RiderDashboard />} />
            </Route>

            {/* Admin portal — isolated */}
            <Route
              element={
                <RequireRole roles={["admin"]}>
                  <RoleShell
                    role="admin"
                    title="Admin"
                    subtitle="Platform control"
                    navItems={adminNav}
                  />
                </RequireRole>
              }
            >
              <Route path="/admin" element={<AdminDashboard />} />
            </Route>

            {/* Legacy shortcuts → login */}
            <Route path="/app" element={<Navigate to="/login" replace />} />

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </TokenCapture>
      <Toaster richColors position="top-right" theme="dark" />
    </TooltipProvider>
  );
}
