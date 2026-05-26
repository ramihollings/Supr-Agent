import { NextResponse } from 'next/server';
import db from '@/lib/database/init';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { password } = body;

    let expectedPassword = process.env.APP_PASSWORD;

    // If APP_PASSWORD is not set in env, check database Settings
    if (!expectedPassword) {
      const row = db.prepare("SELECT value FROM Settings WHERE key = ?").get("app_password") as { value: string } | undefined;
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
      
      // Set the auth token cookie
      response.cookies.set('supr_auth_token', 'true', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
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
