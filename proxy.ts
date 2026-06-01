import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken } from '@/lib/session';

let isAppSecured: boolean | null = null;

async function checkAppSecurity(requestUrl: string): Promise<boolean> {
  if (process.env.APP_PASSWORD) {
    return true;
  }
  if (isAppSecured === true) {
    return true;
  }
  try {
    const statusUrl = new URL('/api/auth/status', requestUrl);
    const res = await fetch(statusUrl.toString());
    if (res.ok) {
      const data = await res.json();
      if (data.secured) {
        isAppSecured = true;
        return true;
      }
    }
  } catch (e) {
    console.error('Failed to check app security status in proxy:', e);
  }
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAuthRoute = pathname.startsWith('/api/auth');
  const isWebhookRoute = pathname === '/api/slack' || pathname === '/api/discord' || pathname === '/api/telegram';
  const isLoginPage = pathname === '/login';
  const isStaticFile =
    pathname.startsWith('/_next') ||
    pathname.includes('.') ||
    pathname.startsWith('/static');

  if (isAuthRoute || isWebhookRoute || isLoginPage || isStaticFile) {
    return NextResponse.next();
  }

  const secured = await checkAppSecurity(request.url);
  if (!secured) {
    const setupUrl = new URL('/login', request.url);
    setupUrl.searchParams.set('callbackUrl', request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(setupUrl);
  }

  const authToken = request.cookies.get('supr_auth_token')?.value;
  if (await verifySessionToken(authToken)) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!api/auth|api/proxy|api/slack|api/discord|api/telegram|_next/static|_next/image|favicon.ico|supr_logo.svg).*)',
  ],
};
