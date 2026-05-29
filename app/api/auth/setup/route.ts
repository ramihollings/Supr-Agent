import { NextResponse } from 'next/server';
import dbClient from '@/lib/database/db_client';
import { createSessionToken, hashPassword, setSessionCookie } from '@/lib/auth';

export async function POST(request: Request) {
  try {
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

    return response;
  } catch (error) {
    console.error("Failed to secure application:", error);
    return NextResponse.json({ success: false, error: 'An unexpected error occurred' }, { status: 500 });
  }
}
