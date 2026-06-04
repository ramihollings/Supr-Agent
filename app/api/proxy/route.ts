import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { safeFetch } from '@/lib/net/safe-fetch';

function normalizeTargetUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
function rewriteHtml(html: string, normalizedUrl: string) {
  const parsedUrl = new URL(normalizedUrl);
  const origin = parsedUrl.origin;

  let rewritten = html.replace(/(src|href)=["'](?!https?:\/\/|\/\/|data:|javascript:|#)([^"']+)["']/gi, (_match, attr, linkPath) => {
    const absolutePath = new URL(linkPath, origin + parsedUrl.pathname).toString();
    return `${attr}="${absolutePath}"`;
  });

  rewritten = rewritten.replace(/(src|href)=["']\/\/([^"']+)["']/gi, (_match, attr, domain) => {
    return `${attr}="https://${domain}"`;
  });

  rewritten = rewritten.replace(/<a\s+([^>]*?)href=["'](https?:\/\/[^"']+)["']/gi, (match, attrs, link) => {
    if (link.includes('/api/proxy')) return match;
    return `<a ${attrs}href="/api/proxy?url=${encodeURIComponent(link)}"`;
  });

  // XSS hardening: strip every executable surface from the proxied HTML.
  // The per-response CSP+sandbox header (set by the caller) is the
  // primary defense; these regexes are belt-and-suspenders so that
  // even a CSP bypass in the browser doesn't give an attacker a way
  // to run code in Supr's origin.
  // - <script>...</script> blocks
  rewritten = rewritten.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // - <script src=...> self-closing / external
  rewritten = rewritten.replace(/<script\b[^>]*\/?>/gi, '');
  // - Inline event handler attributes (onclick, onerror, onload, ...)
  rewritten = rewritten.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // - javascript: URLs in href/src/action
  rewritten = rewritten.replace(/(href|src|action|formaction)\s*=\s*["']\s*javascript:[^"']*["']/gi, '$1="#"');
  // - <form> elements (proxy is read-only)
  rewritten = rewritten.replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, '');
  rewritten = rewritten.replace(/<form\b[^>]*\/?>/gi, '');
  // - Active embed surfaces: <object>, <embed>, <applet>, <base>
  rewritten = rewritten.replace(/<(object|embed|applet|base)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  rewritten = rewritten.replace(/<(object|embed|applet|base)\b[^>]*\/?>/gi, '');
  // - <meta http-equiv="refresh" ...> redirect tricks
  rewritten = rewritten.replace(/<meta\s+http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '');

  const injectedCode = `
    <style>
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-track { background: #f1f1f1; }
      ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    </style>
  `;

  return rewritten.includes('</head>')
    ? rewritten.replace('</head>', `${injectedCode}</head>`)
    : rewritten + injectedCode;
}

export async function GET(request: Request) {
  const authError = await requireApiAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new NextResponse('URL parameter is required', { status: 400 });
  }

  try {
    const normalizedUrl = normalizeTargetUrl(targetUrl);
    const response = await safeFetch(normalizedUrl);

    if (!response.ok) {
      return new NextResponse(`Failed to fetch target URL: ${response.statusText}`, { status: response.status });
    }

    const finalUrl = response.url || normalizedUrl;
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const bytes = new Uint8Array(await response.arrayBuffer());

    if (contentType.includes('text/html')) {
      const html = new TextDecoder().decode(bytes);
      return new NextResponse(rewriteHtml(html, finalUrl), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
          // Per-response CSP: proxied HTML runs in a fully sandboxed
          // context. The `sandbox` directive (with no allow-* tokens)
          // is the most restrictive setting — the document gets an
          // opaque origin, cannot run scripts, cannot submit forms,
          // cannot access the parent frame's storage, and cannot
          // navigate the top-level browsing context. The `default-src
          // 'none'` fallback means any resource type the page tries
          // to load that we did not explicitly allow is denied.
          // We allow `img-src https: data:` so the page can still
          // display images from its own origin, and `style-src
          // 'unsafe-inline'` because we inject a <style> block for
          // the scrollbar theming. Every <script>/event-handler/
          // javascript: URL in the HTML body is also stripped as a
          // second layer of defense.
          'Content-Security-Policy': "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; sandbox",
        },
      });
    }

    return new NextResponse(bytes, {
      headers: {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    return new NextResponse(`Proxy error: ${error.message}`, { status: 400 });
  }
}

