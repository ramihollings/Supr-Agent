#!/usr/bin/env node
/**
 * Copy Next.js standalone build assets.
 *
 * The Next.js standalone build (output: 'standalone') does NOT copy
 * `.next/static` or `public/` into the standalone directory automatically.
 * Without these, every client-side request to /_next/static/* and every
 * public asset 404s, so the app cannot hydrate and E2E tests time out
 * waiting for elements that only appear after JS loads.
 *
 * This script is wired as a `postbuild` hook in package.json so it runs
 * automatically after every `npm run build`. It is idempotent.
 */
import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const STANDALONE = resolve(ROOT, '.next/standalone');

if (!existsSync(STANDALONE)) {
  console.error('[copy-standalone-assets] .next/standalone not found; skipping.');
  process.exit(0);
}

const targets = [
  { from: resolve(ROOT, '.next/static'), to: resolve(STANDALONE, '.next/static') },
  { from: resolve(ROOT, 'public'), to: resolve(STANDALONE, 'public') },
];

for (const { from, to } of targets) {
  if (!existsSync(from)) continue;
  cpSync(from, to, { recursive: true });
  console.log(`[copy-standalone-assets] ${from} -> ${to}`);
}
