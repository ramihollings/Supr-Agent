import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/session';
import { requireApiAuth } from '@/lib/auth';
import { telemetry } from '@/lib/telemetry';

export const dynamic = 'force-dynamic';

// POST /api/auth/logout
// Clears the session cookie. Requires the request to currently be
// authenticated so a stolen session cookie can't be used to log the
// victim out as a denial-of-service primitive.
export async function POST(request: Request) {
  const authError = await requireApiAuth(request);
  if (authError) return authError;
  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  telemetry.info('auth.logout', { at: new Date().toISOString() });
  return response;
}
