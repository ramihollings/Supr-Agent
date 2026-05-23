import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const expectedPassword = process.env.APP_PASSWORD;

  // 1. If APP_PASSWORD is not set, allow all traffic immediately
  if (!expectedPassword) {
    return NextResponse.next();
  }

  // 2. Define exclusions: static files, api routes for auth, and the login page itself
  const isAuthRoute = pathname.startsWith('/api/auth');
  const isLoginPage = pathname === '/login';
  const isStaticFile = 
    pathname.startsWith('/_next') || 
    pathname.includes('.') || 
    pathname.startsWith('/static');

  if (isAuthRoute || isLoginPage || isStaticFile) {
    return NextResponse.next();
  }

  // 3. Check for the session cookie
  const authToken = request.cookies.get('supr_auth_token')?.value;

  if (authToken === 'true') {
    return NextResponse.next();
  }

  // 4. Redirect to login with a callbackUrl parameter
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname + request.nextUrl.search);
  
  return NextResponse.redirect(loginUrl);
}

// Support running on all pages
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes except for /api/auth)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - supr_logo.svg (logo)
     */
    '/((?!api/auth|api/proxy|_next/static|_next/image|favicon.ico|supr_logo.svg).*)',
  ],
};
