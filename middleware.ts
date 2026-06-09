import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken } from '@/lib/session';
import { telemetry } from '@/lib/telemetry';
import { assertProductionAuthEnvironment } from '@/lib/auth_env';

let isAppSecured: boolean | null = null;

function actorKey(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local';
}

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

function generateRequestId(): string {
  // 16 random bytes → base64url, takes ~22 chars.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function logRequest(request: NextRequest, requestId: string, status: number, durationMs: number) {
  const method = request.method;
  const path = request.nextUrl.pathname;
  const query = request.nextUrl.search || '';
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
  const attributes = {
    method,
    path: `${path}${query}`,
    status,
    durationMs,
  };
  const payload = JSON.stringify({
    level,
    type: 'http',
    requestId,
    ...attributes,
    ts: new Date().toISOString(),
  });
  if (level === 'error') {
    console.error(payload);
    telemetry.error('http.request', undefined, attributes, requestId);
  } else if (level === 'warn') {
    console.warn(payload);
    telemetry.warn('http.request', attributes, requestId);
  } else {
    console.log(payload);
    telemetry.info('http.request', attributes, requestId);
  }
}

export async function middleware(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = request.headers.get('x-request-id') || generateRequestId();
  const { pathname } = request.nextUrl;

  const isAuthRoute = pathname.startsWith('/api/auth');
  const isWebhookRoute = pathname === '/api/slack' || pathname === '/api/discord' || pathname === '/api/telegram';
  const isInternalRoute = pathname.startsWith('/api/internal/');
  const isPlatformHealthRoute = pathname === '/api/health/live' || pathname === '/api/health/ready';
  const isLoginPage = pathname === '/login';
  const isStaticFile =
    pathname.startsWith('/_next') ||
    pathname.includes('.') ||
    pathname.startsWith('/static');

  if (isAuthRoute || isWebhookRoute || isInternalRoute || isPlatformHealthRoute || isLoginPage || isStaticFile) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-request-id', requestId);
    requestHeaders.set('x-pathname', pathname);
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    response.headers.set('x-request-id', requestId);
    return response;
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ success: false, error: 'Cross-origin state change rejected.' }, { status: 403 });
    }
  }

  // Fail-closed in production: refuse to serve any non-static request until
  // APP_PASSWORD and AUTH_SECRET are both set.
  const envCheck = assertProductionAuthEnvironment();
  if (!envCheck.ok) {
    const response = new NextResponse(envCheck.reason, { status: 503 });
    response.headers.set('content-type', 'text/plain; charset=utf-8');
    response.headers.set('x-request-id', requestId);
    response.headers.set('retry-after', '60');
    telemetry.error('proxy.production_env_missing', undefined, { reason: envCheck.reason }, requestId);
    logRequest(request, requestId, response.status, Date.now() - startedAt);
    return response;
  }

  const secured = await checkAppSecurity(request.url);
  if (!secured) {
    const setupUrl = new URL('/login', request.url);
    setupUrl.searchParams.set('callbackUrl', request.nextUrl.pathname + request.nextUrl.search);
    const response = NextResponse.redirect(setupUrl);
    response.headers.set('x-request-id', requestId);
    logRequest(request, requestId, response.status, Date.now() - startedAt);
    return response;
  }

  const authToken = request.cookies.get('supr_auth_token')?.value;
  if (await verifySessionToken(authToken)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-request-id', requestId);
    // Forward the pathname so the RootLayout can detect /login
    // and hide the sidebar/chrome. Without this, the layout
    // can't know what page it's on (the layout runs after the
    // proxy and doesn't have direct access to the URL).
    requestHeaders.set('x-pathname', request.nextUrl.pathname);
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    response.headers.set('x-request-id', requestId);
    logRequest(request, requestId, response.status, Date.now() - startedAt);
    return response;
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname + request.nextUrl.search);
  const response = NextResponse.redirect(loginUrl);
  response.headers.set('x-request-id', requestId);
  logRequest(request, requestId, response.status, Date.now() - startedAt);
  return response;
}

export const config = {
  matcher: [
    '/((?!api/auth|api/proxy|api/slack|api/discord|api/telegram|_next/static|_next/image|favicon.ico|supr_logo.svg).*)',
  ],
};
