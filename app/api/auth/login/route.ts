import { NextResponse } from 'next/server';
import {
  createSessionToken,
  getStoredAppPassword,
  setSessionCookie,
  upgradeStoredPasswordIfNeeded,
  verifyPassword,
} from '@/lib/auth';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map<string, number[]>();

function actorKey(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local';
}

function tooManyAttempts(request: Request) {
  const key = actorKey(request);
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter((time) => now - time < LOGIN_WINDOW_MS);
  recent.push(now);
  loginAttempts.set(key, recent);
  return recent.length > LOGIN_MAX_ATTEMPTS;
}

export async function POST(request: Request) {
  try {
    if (tooManyAttempts(request)) {
      return NextResponse.json({ success: false, error: 'Too many login attempts. Try again later.' }, { status: 429 });
    }

    const body = await request.json();
    const { password } = body;

    const expectedPassword = await getStoredAppPassword();

    // If no password is set anywhere, allow access automatically
    if (!expectedPassword) {
      return NextResponse.json({ success: true, message: 'No authentication required' });
    }

    if (typeof password === 'string' && await verifyPassword(password, expectedPassword)) {
      await upgradeStoredPasswordIfNeeded(password, expectedPassword);
      const response = NextResponse.json({ success: true, message: 'Authentication successful' });
      setSessionCookie(response, await createSessionToken(), request);

      return response;
    }

    return NextResponse.json({ success: false, error: 'Invalid password' }, { status: 401 });
  } catch (error) {
    console.error("Login verification failed:", error);
    return NextResponse.json({ success: false, error: 'An unexpected error occurred' }, { status: 500 });
  }
}
