import type { PortalRole } from '@routebite/shared/types';

/**
 * Hardcoded portal credentials (local / demo only).
 * Replace with real IdP + hashed passwords before production.
 */
export interface PortalAccount {
  username: string;
  password: string;
  role: PortalRole;
  name: string;
  email: string;
  /** Stable pseudonymous id used as users.swiggy_id_hash */
  portalId: string;
  homePath: string;
}

export const PORTAL_ACCOUNTS: readonly PortalAccount[] = [
  {
    username: 'user',
    password: 'user123',
    role: 'user',
    name: 'Demo Traveler',
    email: 'user@routebite.local',
    portalId: 'portal:user',
    homePath: '/dashboard',
  },
  {
    username: 'rider',
    password: 'rider123',
    role: 'rider',
    name: 'Demo Rider',
    email: 'rider@routebite.local',
    portalId: 'portal:rider',
    homePath: '/rider',
  },
  {
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    name: 'Demo Admin',
    email: 'admin@routebite.local',
    portalId: 'portal:admin',
    homePath: '/admin',
  },
] as const;

export function findPortalAccount(
  username: string,
  password: string
): PortalAccount | undefined {
  const u = username.trim().toLowerCase();
  return PORTAL_ACCOUNTS.find(
    (a) => a.username === u && a.password === password
  );
}

export function portalHomePath(role: PortalRole): string {
  return PORTAL_ACCOUNTS.find((a) => a.role === role)?.homePath ?? '/login';
}

/** Public demo hints for the login UI (never include passwords in API responses in prod). */
export function portalDemoHints() {
  return PORTAL_ACCOUNTS.map((a) => ({
    username: a.username,
    password: a.password,
    role: a.role,
    name: a.name,
    homePath: a.homePath,
  }));
}
