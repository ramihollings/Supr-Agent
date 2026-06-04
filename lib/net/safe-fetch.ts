/**
 * SSRF-safe fetch primitives shared between /api/proxy, the
 * web_search tool, and the project-flow web_scrape tool.
 *
 * Threat model:
 *   - An attacker controls the URL the agent fetches (params.url).
 *   - The attacker may register a hostname that resolves to a
 *     private IP (e.g. attacker.com → 169.254.169.254), or one
 *     whose DNS record flips between safe and private between
 *     resolution and connect (TOCTOU).
 *
 * Defenses:
 *   1. Protocol allowlist (http/https only).
 *   2. Hostname blocklist (localhost, *.localhost).
 *   3. Resolve DNS once, then re-validate every resolved address
 *      against the private-IP blocklist. The lookup is bound to the
 *      request via undici's `lookup` hook so the actual TCP connect
 *      uses that exact IP, defeating TOCTOU rebinding.
 *   4. Re-validate every redirect target the same way.
 *   5. Cap response size and apply a hard timeout.
 *
 * TLS handling: we KEEP the original hostname in the request URL
 * and let undici do the SNI/cert validation against that hostname.
 * The IP is only used for the TCP `connect` step, not for the URL.
 * This is the only way to make the request both DNS-pinned AND
 * pass standard TLS certificate checks.
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import { Agent, fetch as undiciFetch, Response as UndiciResponse, type RequestInit } from 'undici';

const MAX_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

export function isPrivateIp(ip: string): boolean {
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

/**
 * Resolve a hostname and verify every returned address is public.
 * Returns the first safe address. Used both for the initial URL
 * and for the per-redirect re-validation.
 */
async function resolveAndVetPublicAddress(hostname: string): Promise<string> {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error('Private network resources are blocked.');
    }
    return hostname;
  }
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('Local network resources are blocked.');
  }
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) throw new Error(`Could not resolve host ${hostname}.`);
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new Error(`Private network DNS target blocked: ${hostname} → ${record.address}`);
    }
  }
  return records[0].address;
}

export async function assertSafeUrl(targetUrl: string): Promise<void> {
  const parsedUrl = new URL(targetUrl);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are supported.');
  }
  // resolveAndVetPublicAddress throws on private IPs.
  await resolveAndVetPublicAddress(parsedUrl.hostname);
}

/**
 * Build an undici Agent whose lookup function pins every TCP
 * connect to a vetted IP. The hostname in the URL/Host header is
 * preserved so TLS SNI and certificate validation work normally.
 */
async function buildPinningAgent(hostname: string, port: number): Promise<Agent> {
  const pinnedIp = await resolveAndVetPublicAddress(hostname);
  return new Agent({
    connect: {
      lookup: (_host, _options, callback) => {
        // Always return the vetted IP, ignoring the host argument
        // (which is the URL's hostname). This binds the TCP
        // connection to the IP we vetted, defeating TOCTOU rebinds.
        callback(null, [{ address: pinnedIp, family: pinnedIp.includes(':') ? 6 : 4 }]);
      },
    },
    // Reasonable body / header timeouts.
    bodyTimeout: FETCH_TIMEOUT_MS,
    headersTimeout: FETCH_TIMEOUT_MS,
  });
}

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export async function safeFetch(url: string, options: SafeFetchOptions = {}): Promise<any> {
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;

  let currentUrl = url;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const parsed = new URL(currentUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only HTTP and HTTPS URLs are supported.');
    }
    // The Agent's lookup function re-validates the hostname on
    // every connect, so a private-IP answer is rejected even if
    // the URL/hostname look safe at the call site.
    const agent = await buildPinningAgent(parsed.hostname, Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80));
    const init: RequestInit = {
      method: 'GET',
      headers: {
        'User-Agent': 'SuprSafeFetch/1.0',
        ...options.headers,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      dispatcher: agent,
    };
    let response: any;
    try {
      response = await undiciFetch(currentUrl, init);
    } finally {
      // undici agents are connection-pooled; closing is a no-op
      // for the caller but releases idle sockets promptly.
      agent.close();
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect response did not include a location.');
      // Re-validate the redirect target's hostname against the
      // private-IP blocklist before following. The new agent for
      // the next iteration will re-vet on connect as well.
      const nextParsed = new URL(location, currentUrl);
      if (!['http:', 'https:'].includes(nextParsed.protocol)) {
        throw new Error('Only HTTP and HTTPS redirect targets are supported.');
      }
      await resolveAndVetPublicAddress(nextParsed.hostname);
      currentUrl = nextParsed.toString();
      continue;
    }
    // Enforce a hard size cap on the body.
    const contentLength = response.headers.get('content-length');
    if (contentLength && Number(contentLength) > maxBytes) {
      throw new Error('Target response is too large.');
    }
    if (!response.body) {
      const emptyRes = new UndiciResponse(new Uint8Array(), { headers: response.headers, status: response.status }) as any;
      emptyRes.url = currentUrl;
      return emptyRes;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.length;
      if (total > maxBytes) {
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
    const finalRes = new UndiciResponse(merged, { headers: response.headers, status: response.status }) as any;
    finalRes.url = currentUrl;
    return finalRes;
  }
  throw new Error('Too many redirects.');
}

export async function safeFetchText(url: string, options: SafeFetchOptions = {}): Promise<string> {
  const response = await safeFetch(url, options);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  // undiciResponse.text() is the right way to read the body.
  return await response.text();
}
