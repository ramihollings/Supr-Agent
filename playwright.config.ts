import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT || 3002);
const BASE_URL = process.env.E2E_BASE_URL || `http://127.0.0.1:${PORT}`;
const APP_PASSWORD = process.env.E2E_APP_PASSWORD || "e2e-test-password";
const AUTH_SECRET = process.env.E2E_AUTH_SECRET || "e2e-test-secret";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: BASE_URL,
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Use the Next.js standalone build for the E2E test server.
    // This is closer to a real production deployment than `next start`
    // and catches issues with the standalone bundler that would
    // otherwise only show up in a packaged deploy.
    command: `node .next/standalone/server.js`,
    url: `${BASE_URL}/api/auth/status`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      NODE_ENV: "production",
      SUPR_ALLOW_PRODUCTION_SQLITE_FOR_TESTS: "true",
      APP_PASSWORD,
      AUTH_SECRET,
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
    },
  },
});
