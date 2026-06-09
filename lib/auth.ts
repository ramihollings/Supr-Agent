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
