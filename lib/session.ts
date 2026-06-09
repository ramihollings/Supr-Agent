if (process.env.APP_PASSWORD) {
  process.env.APP_PASSWORD = process.env.APP_PASSWORD.trim();
}
if (process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = process.env.AUTH_SECRET.trim();
}

import { NextResponse } from 'next/server';

export const SESSION_COOKIE = 'supr_auth_token';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function getAuthSecret() {
  return process.env.AUTH_SECRET || process.env.APP_PASSWORD || process.env.NEXTAUTH_SECRET || 'supr-local-dev-secret';
}

export function getAuthSecretMetadata() {
  if (process.env.AUTH_SECRET) return { source: 'AUTH_SECRET', usesDefaultSecret: false };
  if (process.env.APP_PASSWORD) return { source: 'APP_PASSWORD', usesDefaultSecret: false };
  if (process.env.NEXTAUTH_SECRET) return { source: 'NEXTAUTH_SECRET', usesDefaultSecret: false };
  return { source: 'default_dev_secret', usesDefaultSecret: true };
}

export function base64UrlEncode(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function secureEquals(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function hmacSha256(payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getAuthSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

export async function createSessionToken() {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + SESSION_TTL_SECONDS;
  const nonce = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ issuedAt, expiresAt, nonce })));
  const signature = await hmacSha256(payload);
  return `${payload}.${signature}`;
}

export async function verifySessionToken(token?: string | null) {
  if (!token || !token.includes('.')) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  const expectedSignature = await hmacSha256(payload);
  if (!secureEquals(signature, expectedSignature)) return false;

  try {
    const data = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as { expiresAt?: number };
    return typeof data.expiresAt === 'number' && data.expiresAt > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function setSessionCookie(response: NextResponse, token: string, request: Request) {
  const isHttps = request.url.startsWith('https:') || request.headers.get('x-forwarded-proto') === 'https';
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || isHttps,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  const sameSite = (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax';
  response.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite,
    path: '/',
    maxAge: 0,
  });
}

export function readSessionCookie(request: Request) {
  const cookieHeader = request.headers.get('cookie') || '';
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}
