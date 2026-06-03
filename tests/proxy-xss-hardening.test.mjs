import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const REPO_ROOT = join(import.meta.dirname, '..');
const PROXY_SOURCE = readFileSync(join(REPO_ROOT, 'app/api/proxy/route.ts'), 'utf8');

/**
 * Proxy XSS hardening regression test.
 *
 * The /api/proxy route returns third-party HTML as Supr-origin HTML.
 * A previous version of `rewriteHtml` only rewrote relative URLs and
 * then *injected its own <script>* to intercept form submissions, with
 * no CSP and no sandbox. That meant any malicious proxied page could
 * run arbitrary JS in Supr's origin and call authenticated APIs.
 *
 * The fix:
 * 1. rewriteHtml strips <script>, event handler attributes, javascript:
 *    URLs, <form>, <object>/<embed>/<applet>/<base>, and meta-refresh.
 * 2. The injected <script> for form interception is removed entirely.
 * 3. The response includes a per-response CSP and `sandbox` directive.
 *
 * These tests assert the fix is in place by pattern-matching the source.
 */

test('proxy strips <script> blocks from proxied HTML', () => {
  assert.match(PROXY_SOURCE, /<script\b[\s\S]*?<\/script>/);
  assert.match(PROXY_SOURCE, /<script\b[^>]*\/?>/);
});

test('proxy strips inline event handler attributes (onclick, onerror, ...)', () => {
  // The stripper regex is something like:
  //   /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi
  // We assert the key pieces are present.
  assert.match(PROXY_SOURCE, /on\[a-z\]\+/);
  assert.match(PROXY_SOURCE, /\\s\*=\\s\*\(\?:"/);
});

test('proxy neutralizes javascript: URLs in href/src/action', () => {
  // The stripper regex is something like:
  //   /(href|src|action|formaction)\s*=\s*["']\s*javascript:[^"']*["']/gi
  assert.match(PROXY_SOURCE, /href\|src\|action\|formaction/);
  assert.match(PROXY_SOURCE, /javascript:/);
});

test('proxy removes <form> elements entirely', () => {
  // The stripper regex literal in the source contains both an opening
  // and closing form tag (with the </ escaped for the regex). Assert
  // the stripper is present via string matchers to avoid regex-escape
  // pitfalls; the actual <form> content gets removed from proxied
  // HTML at runtime, so the source has no reason to contain a literal
  // </form> string.
  assert.ok(PROXY_SOURCE.includes('<form'), 'source must mention <form> stripping');
  // The source must contain the self-closing form stripper pattern.
  assert.ok(
    PROXY_SOURCE.includes('<form\\b[^>]*\\/?>'),
    'source must contain self-closing form stripper regex'
  );
  // And the paired form stripper.
  assert.ok(
    PROXY_SOURCE.includes('<form\\b[^>]*>'),
    'source must contain paired form stripper regex'
  );
});

test('proxy removes active embed surfaces (object, embed, applet, base)', () => {
  assert.match(PROXY_SOURCE, /object\|embed\|applet\|base/);
});

test('proxy removes meta-refresh redirect tricks', () => {
  assert.match(PROXY_SOURCE, /http-equiv/);
  assert.match(PROXY_SOURCE, /refresh/);
});

test('proxy no longer injects a <script> for form interception', () => {
  // The previous version had a <script>document.addEventListener('submit'...)
  // block that ran in the proxied page. Forms are now stripped entirely,
  // so no interception script is needed.
  assert.doesNotMatch(PROXY_SOURCE, /addEventListener\(['"]submit['"]/);
});

test('proxy response includes a per-response Content-Security-Policy', () => {
  assert.match(PROXY_SOURCE, /'Content-Security-Policy'/);
  assert.match(PROXY_SOURCE, /default-src 'none'/);
  assert.match(PROXY_SOURCE, /sandbox/);
});

test('proxy CSP sandbox directive is fully restrictive (no allow-* tokens)', () => {
  // The sandbox header value must use the most restrictive setting —
  // just `sandbox` with no allow-* tokens. This gives the document
  // an opaque origin, so it cannot access the Supr session cookie,
  // localStorage, or call authenticated APIs even if a sanitizer bug
  // lets an attacker inject content. Adding `allow-same-origin`
  // would re-enable those vectors.
  // Anchor to the CSP header line specifically so we don't accidentally
  // match the word "sandbox" in a comment.
  const cspLine = PROXY_SOURCE.match(/'Content-Security-Policy':\s*"([^"]+)"/);
  assert.ok(cspLine, 'expected Content-Security-Policy header in proxy response');
  const csp = cspLine[1];
  // The sandbox token must be present, with no allow-* flags.
  assert.match(csp, /sandbox(?:\s*$|\s*;)/, 'expected sandbox directive in CSP');
  // The full CSP value must not contain any "allow-*" tokens.
  assert.doesNotMatch(csp, /allow-[a-z-]+/, 'CSP must not include any allow-* sandbox tokens');
});
