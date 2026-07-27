import { describe, expect, test } from 'bun:test';
import {
  findPortalAccount,
  portalDemoHints,
  portalHomePath,
} from '../../src/services/auth/portal-accounts';

describe('portal accounts', () => {
  test('accepts hardcoded credentials for each role', () => {
    expect(findPortalAccount('user', 'user123')?.role).toBe('user');
    expect(findPortalAccount('rider', 'rider123')?.role).toBe('rider');
    expect(findPortalAccount('admin', 'admin123')?.role).toBe('admin');
  });

  test('rejects bad passwords', () => {
    expect(findPortalAccount('user', 'wrong')).toBeUndefined();
    expect(findPortalAccount('admin', '')).toBeUndefined();
  });

  test('home paths are isolated', () => {
    expect(portalHomePath('user')).toBe('/dashboard');
    expect(portalHomePath('rider')).toBe('/rider');
    expect(portalHomePath('admin')).toBe('/admin');
  });

  test('demo hints expose three accounts', () => {
    expect(portalDemoHints()).toHaveLength(3);
  });
});
