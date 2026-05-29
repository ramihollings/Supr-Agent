import { NextResponse } from 'next/server';
import {
  createSessionToken,
  getStoredAppPassword,
  setSessionCookie,
  upgradeStoredPasswordIfNeeded,
  verifyPassword,
} from '@/lib/auth';

export async function POST(request: Request) {
  try {
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
