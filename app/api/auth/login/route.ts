import { NextResponse } from 'next/server';
import dbClient from '@/lib/database/db_client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { password } = body;

    let expectedPassword = process.env.APP_PASSWORD;

    // If APP_PASSWORD is not set in env, check database Settings
    if (!expectedPassword) {
      const row = await dbClient.queryOne<{ value: string }>("SELECT value FROM Settings WHERE key = ?", ["app_password"]);
      if (row && row.value) {
        expectedPassword = row.value;
      }
    }

    // If no password is set anywhere, allow access automatically
    if (!expectedPassword) {
      return NextResponse.json({ success: true, message: 'No authentication required' });
    }

    if (password === expectedPassword) {
      const response = NextResponse.json({ success: true, message: 'Authentication successful' });
      
      const isHttps = request.url.startsWith('https:') || request.headers.get('x-forwarded-proto') === 'https';
      
      // Set the auth token cookie
      response.cookies.set('supr_auth_token', 'true', {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      return response;
    }

    return NextResponse.json({ success: false, error: 'Invalid password' }, { status: 401 });
  } catch (error) {
    console.error("Login verification failed:", error);
    return NextResponse.json({ success: false, error: 'An unexpected error occurred' }, { status: 500 });
  }
}
