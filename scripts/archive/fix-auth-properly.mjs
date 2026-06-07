// scripts/fix-auth-properly.mjs
// Add clearSessionCookie() to lib/session.ts and wire x-pathname in
// the proxy so the layout can detect /login and hide the Sidebar.
import { readFileSync, writeFileSync } from 'node:fs';

// 1) Add clearSessionCookie to lib/session.ts.
const sessionPath = 'lib/session.ts';
let sessionSrc = readFileSync(sessionPath, 'utf-8');
if (!sessionSrc.includes('export function clearSessionCookie')) {
    // Find the setSessionCookie function and append clearSessionCookie
    // right after it. We anchor on the function's closing brace and
    // the export.
    const anchor = 'export function setSessionCookie(response: NextResponse, token: string): void {';
    if (sessionSrc.includes(anchor)) {
        // Find the matching closing brace by scanning forward.
        let depth = 0;
        let startIdx = -1;
        for (let i = sessionSrc.indexOf(anchor); i < sessionSrc.length; i += 1) {
            if (sessionSrc[i] === '{') {
                if (startIdx === -1) startIdx = i;
                depth += 1;
            } else if (sessionSrc[i] === '}') {
                depth -= 1;
                if (depth === 0) {
                    // Insert the new function right after the closing brace.
                    const insertAt = i + 1;
                    const newFn = `

/**
 * Clear the session cookie on a response. We use Max-Age=0 so the
 * browser drops the cookie immediately. The \`HttpOnly\` and
 * \`SameSite\` flags match \`setSessionCookie\` so the browser
 * actually accepts the overwrite.
 */
export function clearSessionCookie(response: NextResponse): void {
  const sameSite = (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax';
  response.cookies.set({
    name: 'supr_auth_token',
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite,
    path: '/',
    maxAge: 0,
  });
}`;
                    sessionSrc = sessionSrc.substring(0, insertAt) + newFn + sessionSrc.substring(insertAt);
                    break;
                }
            }
        }
    }
}
writeFileSync(sessionPath, sessionSrc, 'utf-8');
console.log('OK: clearSessionCookie added to lib/session.ts');

// 2) Wire x-pathname in the proxy so the layout can detect /login.
const proxyPath = 'proxy.ts';
let proxySrc = readFileSync(proxyPath, 'utf-8');
if (!proxySrc.includes("'x-pathname'")) {
    const oldHeaders = `    const response = NextResponse.next({
      request: {
        headers: new Headers({ ...Object.fromEntries(request.headers), 'x-request-id': requestId }),
      },
    });`;
    const newHeaders = `    const requestHeaders = new Headers(request.headers);
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
    });`;
    if (proxySrc.includes(oldHeaders)) {
        proxySrc = proxySrc.replace(oldHeaders, newHeaders);
    }
    writeFileSync(proxyPath, proxySrc, 'utf-8');
    console.log('OK: proxy forwards x-pathname header');
} else {
    console.log('SKIP: x-pathname already wired');
}
