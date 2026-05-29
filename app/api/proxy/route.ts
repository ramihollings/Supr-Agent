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

async function fetchSafely(initialUrl: string) {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertSafeUrl(currentUrl);

    const response = await fetch(currentUrl, {
      headers: {
        'User-Agent': 'SuprProxy/1.0',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect response did not include a location.');
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return { response, finalUrl: currentUrl };
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

  const injectedCode = `
    <style>
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-track { background: #f1f1f1; }
      ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    </style>
    <script>
      document.addEventListener('submit', function(e) {
        const form = e.target;
        if (form && form.action) {
          e.preventDefault();
          const actionUrl = new URL(form.action, window.location.href).href;
          const method = (form.method || 'GET').toUpperCase();
          if (method === 'GET') {
            const formData = new FormData(form);
            const params = new URLSearchParams();
            for (const [key, value] of formData.entries()) params.append(key, value.toString());
            const separator = actionUrl.includes('?') ? '&' : '?';
            window.location.href = '/api/proxy?url=' + encodeURIComponent(actionUrl + separator + params.toString());
          }
        }
      });
    </script>
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

