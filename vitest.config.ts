import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Vitest config for Supr's unit-test suite.
 *
 * Scope:
 *   - Pure helpers under `lib/runtime/agent-runtime-pure.ts`
 *     (parseModelToolResponse, hasCompletionEvidence, ...).
 *   - Cost-tracker / budget-engine pricing logic, no DB.
 *   - Reflection prompt contract (static).
 *   - ModelUsage / streamContentWithUsage / generateContentWithUsage
 *     wiring (static + cheap runtime cases).
 *
 * The integration suite (real SQLite, real MCP stdio child processes)
 * still lives in `tests/*.test.mjs` and runs through `tsx --test`.
 * The two suites are independent: this one runs fast on every save
 * (`vitest --watch`), the other runs on every PR via
 * `npm run test:security`.
 */
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10_000,
    pool: 'forks',
    maxWorkers: 1,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
});
