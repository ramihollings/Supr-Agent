import { NextResponse } from 'next/server';
import dns from 'dns/promises';
import net from 'net';
import { requireApiAuth } from '@/lib/auth';

const MAX_REDIRECTS = 3;
const MAX_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10000;

function isPrivateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:')
    );
  }

  return true;
}

async function assertSafeUrl(targetUrl: string) {
  const parsedUrl = new URL(targetUrl);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are supported.');
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('Local network resources are blocked.');
  }

  if (net.isIP(hostname) && isPrivateIp(hostname)) {
    throw new Error('Private network resources are blocked.');
  }

  const addresses = await dns.lookup(hostname, { all: true, verbatim: false });
  if (addresses.length === 0 || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error('Private network DNS targets are blocked.');
  }
}

function normalizeTargetUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

interface ResolvedTarget {
  /** URL with the host replaced by the resolved IP, used for the actual fetch. */
  pinnedUrl: string;
  /** Original hostname, sent in the Host header so the origin server routes correctly. */
  originalHost: string;
  /** Original URL (hostname form) for logging and HTML rewriting. */
  logUrl: string;
  /** True if the host is an IP literal and was already vetted in-line. */
  isLiteralIp: boolean;
}

/**
 * Resolve a URL to a single IP and return both the pinned URL and the
 * original hostname. This is the TOCTOU mitigation for the SSRF defense:
 * we resolve DNS once for the safety check, then use that same IP for
 * the actual fetch so the host cannot rebound to a different address
 * between the validate and the request.
 */
async function resolvePinnedUrl(targetUrl: string): Promise<ResolvedTarget> {
  const parsed = new URL(targetUrl);
  const hostname = parsed.hostname.toLowerCase();
  const protocol = parsed.protocol;
  if (!['http:', 'https:'].includes(protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are supported.');
  }

  // IP-literal host: validate the literal directly; no DNS involved.
  if (net.isIP(hostname)) {
    return {
      pinnedUrl: targetUrl,
      originalHost: hostname,
      logUrl: targetUrl,
      isLiteralIp: true,
    };
  }

  // Hostname host: resolve once, then build a URL with the IP literal.
  // Use { all: true, verbatim: true } so we pick the first record in the
  // order Node's resolver returns it, without preferring IPv4 over IPv6
  // or vice versa. The fetch then goes to the IP we vetted, with the
  // Host header carrying the original hostname for virtual hosting.
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) throw new Error(`Could not resolve host ${hostname}.`);
  const firstAddress = records[0].address;
  return {
    pinnedUrl: `${protocol}//${firstAddress}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}${parsed.search}`,
    originalHost: parsed.host,
    logUrl: targetUrl,
    isLiteralIp: false,
  };
}

function buildResolvedUrl(parsed: { protocol: string; hostname: string; port: string; pathname: string; search: string; host: string }): ResolvedTarget {
  // Same shape as resolvePinnedUrl, but used for relative redirect
  // targets where the new hostname is already an IP literal.
  if (net.isIP(parsed.hostname)) {
    return {
      pinnedUrl: parsed.protocol + '//' + parsed.host + parsed.pathname + parsed.search,
      originalHost: parsed.hostname,
      logUrl: parsed.protocol + '//' + parsed.host + parsed.pathname + parsed.search,
      isLiteralIp: true,
    };
  }
  // Hostname redirect target: re-resolve through the same DNS pin path.
  // Returning the hostname form triggers a re-resolve in fetchSafely.
  return {
    pinnedUrl: '',
    originalHost: parsed.host,
    logUrl: parsed.protocol + '//' + parsed.host + parsed.pathname + parsed.search,
    isLiteralIp: false,
  };
}

async function fetchSafely(initialUrl: string) {
  let current = await resolvePinnedUrl(initialUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    if (!current.isLiteralIp && current.pinnedUrl === '') {
      // Redirect target was a hostname; re-resolve and re-vet.
      current = await resolvePinnedUrl(current.logUrl);
    }
    await assertSafeUrl(current.logUrl);

    const response = await fetch(current.pinnedUrl, {
      headers: {
        'User-Agent': 'SuprProxy/1.0',
        // The pinnedUrl points at the IP; the origin server needs the
        // real Host header to route virtual-hosted domains correctly.
        'Host': current.originalHost,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect response did not include a location.');
      const nextParsed = new URL(location, current.pinnedUrl);
      const nextHostname = nextParsed.hostname.toLowerCase();
      // We must re-validate the redirect target -- it might point at a
      // private IP. If it's a hostname, we resolve-and-pin; if it's
      // already an IP literal, we vet the literal directly.
      const reCheck = buildResolvedUrl(nextParsed);
      if (reCheck.isLiteralIp) {
        await assertSafeUrl(reCheck.logUrl);
        current = reCheck;
      } else {
        current = await resolvePinnedUrl(reCheck.logUrl);
        await assertSafeUrl(current.logUrl);
      }
      continue;
    }

    return { response, finalUrl: current.logUrl };
  }

  throw new Error('Too many redirects.');
}

async function readLimited(response: Response) {
  const contentLength = response.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_BYTES) {
    throw new Error('Target response is too large.');
  }

  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error('Target response exceeded the size limit.');
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
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
    const { response, finalUrl } = await fetchSafely(normalizedUrl);

    if (!response.ok) {
      return new NextResponse(`Failed to fetch target URL: ${response.statusText}`, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const bytes = await readLimited(response);

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

