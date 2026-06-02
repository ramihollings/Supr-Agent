import { NextResponse } from 'next/server';
import dbClient from '@/lib/database/db_client';
import {
  createSessionToken,
  base64UrlDecode,
  base64UrlEncode,
  readSessionCookie,
  secureEquals,
  setSessionCookie,
  verifySessionToken,
} from '@/lib/session';

const PASSWORD_HASH_PREFIX = 'pbkdf2';
const PBKDF2_ITERATIONS = 210000;

async function pbkdf2(password: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS) {
  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBuffer, iterations, hash: 'SHA-256' },
    key,
    256
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return `${PASSWORD_HASH_PREFIX}$${PBKDF2_ITERATIONS}$${base64UrlEncode(salt)}$${base64UrlEncode(hash)}`;
}

export async function verifyPassword(password: string, storedValue: string) {
  if (!storedValue.startsWith(`${PASSWORD_HASH_PREFIX}$`)) {
    return secureEquals(password, storedValue);
  }

  const parts = storedValue.split('$');
  if (parts.length !== 4) return false;

  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 100000) return false;

  const salt = base64UrlDecode(parts[2]);
  const expectedHash = parts[3];
  const actualHash = base64UrlEncode(await pbkdf2(password, salt, iterations));
  return secureEquals(actualHash, expectedHash);
}

export async function getStoredAppPassword() {
  if (process.env.APP_PASSWORD) return process.env.APP_PASSWORD;
  const row = await dbClient.queryOne<{ value: string }>('SELECT value FROM Settings WHERE key = ?', ['app_password']);
  return row?.value || null;
}

export async function isAppSecured() {
  const password = await getStoredAppPassword();
  return !!password;
}

let productionEnvChecked = false;

/**
 * Fail-closed assertion for production deployments.
 *
 * Without `APP_PASSWORD` set, the login flow falls back to a hash stored
 * in SQLite, and without `AUTH_SECRET` set, the session HMAC uses a
 * well-known local development default. Neither is acceptable for a VPS
 * exposed to the network.
 *
 * This is invoked once per process from the proxy and the auth routes.
 * If anything is missing in production, the process logs the error and
 * the first protected request returns 503, making the misconfig obvious
 * instead of silently shipping with a default secret.
 */
export function assertProductionAuthEnvironment(): { ok: true } | { ok: false; reason: string } {
  if (productionEnvChecked) return { ok: true };
  if (process.env.NODE_ENV !== 'production') {
    productionEnvChecked = true;
    return { ok: true };
  }

  const missing: string[] = [];
  if (!process.env.APP_PASSWORD) missing.push('APP_PASSWORD');
  if (!process.env.AUTH_SECRET) missing.push('AUTH_SECRET');

  if (missing.length > 0) {
    const reason = `Refusing to start in production: missing required env var(s) ${missing.join(', ')}. Both APP_PASSWORD and AUTH_SECRET must be set before exposing Supr to the network.`;
    console.error(`[Supr] ${reason}`);
    productionEnvChecked = true;
    return { ok: false, reason };
  }

  productionEnvChecked = true;
  return { ok: true };
}

export async function requireApiAuth(request: Request) {
  const secured = await isAppSecured();
  if (!secured) {
    return NextResponse.json({ success: false, error: 'Application setup is required.' }, { status: 403 });
  }

  if (await verifySessionToken(readSessionCookie(request))) return null;
  return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
}

export async function upgradeStoredPasswordIfNeeded(password: string, storedValue: string) {
  if (process.env.APP_PASSWORD || storedValue.startsWith(`${PASSWORD_HASH_PREFIX}$`)) return;
  const hashed = await hashPassword(password);
  await dbClient.execute(
    `UPDATE Settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?`,
    [hashed, 'app_password']
  );
}

export { createSessionToken, setSessionCookie };
