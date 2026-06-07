import { NextResponse } from 'next/server';
import {
  createSessionToken,
  getStoredAppPassword,
  setSessionCookie,
  upgradeStoredPasswordIfNeeded,
  verifyPassword,
} from '@/lib/auth';
import { telemetry } from '@/lib/telemetry';
import { consumeDurable } from '@/lib/route-rate-limit';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

function actorKey(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local';
}

export async function POST(request: Request) {
  try {
    if (!await consumeDurable(`auth:login:${actorKey(request)}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS)) {
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
      telemetry.info('auth.login', { actor: actorKey(request) });
      return response;
    }

    telemetry.warn('auth.login.failed', { actor: actorKey(request) });
    return NextResponse.json({ success: false, error: 'Invalid password' }, { status: 401 });
  } catch (error) {
    console.error("Login verification failed:", error);
    return NextResponse.json({ success: false, error: 'An unexpected error occurred' }, { status: 500 });
  }
}
