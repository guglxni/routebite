import { Outlet, useLocation } from "react-router-dom";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { PageTransition } from "./PageTransition";

const appRoutes = [
  "/dashboard",
  "/routes",
  "/intercepts",
  "/menu",
  "/order",
  "/orders",
  "/track",
  "/rider",
  "/admin",
  "/login",
];

export function Layout() {
  const location = useLocation();
  const isAppShell = appRoutes.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`));
  const isLanding = location.pathname === "/";
  const isLogin = location.pathname === "/login";

  return (
    <div className="min-h-dvh flex flex-col">
      {!isAppShell && !isLanding && !isLogin && <Navbar />}
      <main className={`flex-1 ${!isAppShell && !isLanding && !isLogin ? "pt-16" : ""}`}>
        <PageTransition key={location.pathname}>
          <Outlet />
        </PageTransition>
      </main>
      {!isAppShell && !isLanding && !isLogin && <Footer />}
    </div>
  );
}
