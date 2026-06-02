import { NextResponse } from 'next/server';
import dbClient from '@/lib/database/db_client';
import { createSessionToken, hashPassword, setSessionCookie } from '@/lib/auth';
import { telemetry } from '@/lib/telemetry';

const SETUP_WINDOW_MS = 15 * 60 * 1000;
const SETUP_MAX_ATTEMPTS = 5;
const setupAttempts = new Map<string, number[]>();

function actorKey(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local';
}

function tooManyAttempts(request: Request) {
  const key = actorKey(request);
  const now = Date.now();
  const recent = (setupAttempts.get(key) || []).filter((time) => now - time < SETUP_WINDOW_MS);
  recent.push(now);
  setupAttempts.set(key, recent);
  return recent.length > SETUP_MAX_ATTEMPTS;
}

export async function POST(request: Request) {
  try {
    if (tooManyAttempts(request)) {
      return NextResponse.json({ success: false, error: 'Too many setup attempts. Try again later.' }, { status: 429 });
    }

    const body = await request.json();
    const { password } = body;

    if (!password || typeof password !== 'string' || password.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Password must not be empty' }, { status: 400 });
    }

    // Check if the app is already secured to prevent hijacking
    if (process.env.APP_PASSWORD) {
      return NextResponse.json({ success: false, error: 'Application is already secured via environment configuration' }, { status: 400 });
    }

    const row = await dbClient.queryOne<{ value: string }>("SELECT value FROM Settings WHERE key = ?", ["app_password"]);
    if (row && row.value) {
      return NextResponse.json({ success: false, error: 'Application is already secured' }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);

    // Save the password hash to Settings table
    await dbClient.execute(`
      INSERT INTO Settings (key, value, updated_at)
      VALUES ('app_password', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
    `, [passwordHash]);

    // Create session response
    const response = NextResponse.json({ success: true, message: 'Authentication successful' });

    setSessionCookie(response, await createSessionToken(), request);
    telemetry.info('auth.setup', { actor: actorKey(request) });

    return response;
  } catch (error) {
    console.error("Failed to secure application:", error);
    telemetry.error('auth.setup.failed', error, { actor: actorKey(request) });
    return NextResponse.json({ success: false, error: 'An unexpected error occurred' }, { status: 500 });
  }
}
