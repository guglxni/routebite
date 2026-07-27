import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PortalRole } from "@routebite/shared/types";
import {
  getAuthUrl,
  getMe,
  getPortalInfo,
  portalLogin,
  portalLogout,
  type PortalAccountHint,
} from "../lib/api";

function syncRbToken(token: string | null) {
  if (token) localStorage.setItem("rb_token", token);
  else localStorage.removeItem("rb_token");
}

export function homePathForRole(role: PortalRole | null | undefined): string {
  if (role === "rider") return "/rider";
  if (role === "admin") return "/admin";
  if (role === "user") return "/dashboard";
  return "/login";
}

interface AuthUser {
  id: number;
  role: PortalRole;
  name?: string;
  email?: string;
  username?: string;
  homePath?: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  hydrated: boolean;
  sessionError: string | null;
  portalHints: PortalAccountHint[];
  setToken: (t: string | null) => void;
  setUser: (u: AuthState["user"]) => void;
  setHydrated: () => void;
  login: () => Promise<void>;
  loginWithCredentials: (username: string, password: string) => Promise<string>;
  loadPortalHints: () => Promise<void>;
  ensureSession: () => Promise<boolean>;
  logout: () => void;
  fetchUser: () => Promise<boolean>;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      hydrated: false,
      sessionError: null,
      portalHints: [],
      setToken: (token) => {
        syncRbToken(token);
        set({ token, sessionError: null });
      },
      setUser: (user) => set({ user }),
      setHydrated: () => set({ hydrated: true }),
      login: async () => {
        const { url } = await getAuthUrl();
        window.location.href = url;
      },
      loginWithCredentials: async (username, password) => {
        const session = await portalLogin(username, password);
        syncRbToken(session.token);
        set({
          token: session.token,
          user: {
            id: 0,
            role: session.role,
            name: session.name,
            email: session.email,
            username: session.username,
            homePath: session.homePath,
          },
          sessionError: null,
        });
        await get().fetchUser();
        return session.homePath;
      },
      loadPortalHints: async () => {
        try {
          const info = await getPortalInfo();
          set({ portalHints: info.accounts });
        } catch {
          // Fallback if API down — still show local hints on Login page
        }
      },
      ensureSession: async () => {
        const { token } = get();
        if (token) syncRbToken(token);
        else {
          const fromApi = localStorage.getItem("rb_token");
          if (fromApi) set({ token: fromApi });
        }
        if (!get().token) return false;
        return get().fetchUser();
      },
      logout: () => {
        void portalLogout().catch(() => undefined);
        syncRbToken(null);
        set({ token: null, user: null, sessionError: null });
        window.location.href = "/login";
      },
      fetchUser: async () => {
        if (!get().token) return false;
        syncRbToken(get().token);
        try {
          const me = await getMe();
          set({
            user: {
              id: me.id,
              role: me.role,
              name: me.name ?? undefined,
              email: me.email ?? undefined,
              username: me.username ?? undefined,
              homePath: me.homePath ?? homePathForRole(me.role),
            },
            sessionError: null,
          });
          return true;
        } catch (err) {
          const status = (err as Error & { statusCode?: number }).statusCode;
          if (status === 401 || status === 403) {
            syncRbToken(null);
            set({
              token: null,
              user: null,
              sessionError: "Session expired. Please sign in again.",
            });
            return false;
          }
          set({ sessionError: (err as Error).message || "Could not reach API" });
          return false;
        }
      },
    }),
    {
      name: "rb_auth",
      partialize: (s) => ({ token: s.token }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
        if (state?.token) {
          syncRbToken(state.token);
          void state.fetchUser();
        }
      },
    }
  )
);
