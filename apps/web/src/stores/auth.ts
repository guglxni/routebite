import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getMe, getAuthUrl } from "../lib/api";

interface AuthState {
  token: string | null;
  user: { id: number; name?: string; email?: string } | null;
  hydrated: boolean;
  setToken: (t: string | null) => void;
  setUser: (u: AuthState["user"]) => void;
  setHydrated: () => void;
  login: () => Promise<void>;
  devLogin: () => void;
  logout: () => void;
  fetchUser: () => Promise<void>;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      hydrated: false,
      setToken: (token) => set({ token }),
      setUser: (user) => set({ user }),
      setHydrated: () => set({ hydrated: true }),
      login: async () => {
        const { url } = await getAuthUrl();
        window.location.href = url;
      },
      devLogin: () => {
        const token = import.meta.env.VITE_DEV_SESSION_TOKEN ?? "routebite-dev-session";
        localStorage.setItem("rb_token", token);
        set({ token });
        get().fetchUser();
      },
      logout: () => {
        localStorage.removeItem("rb_token");
        set({ token: null, user: null });
        window.location.href = "/";
      },
      fetchUser: async () => {
        if (!get().token) return;
        try {
          const me = await getMe();
          set({ user: { id: me.id, name: me.name, email: me.email } });
        } catch {
          set({ token: null, user: null });
          localStorage.removeItem("rb_token");
        }
      },
    }),
    {
      name: "rb_auth",
      partialize: (s) => ({ token: s.token }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
        if (state?.token) {
          state.fetchUser();
        }
      },
    }
  )
);
