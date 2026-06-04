import { test, expect, type Page, type APIRequestContext, request as playwrightRequest } from "@playwright/test";

/**
 * E2E tests for the new Blueprint 5.0 HTTP routes.
 *
 * Covers:
 *   - PATCH /api/mcp/servers (server toggle)
 *   - GET/POST /api/skills/lessons (per-skill summary + prune)
 *   - GET/POST /api/context/compaction (config + update)
 *   - POST /api/telegram (forged webhook rejected)
 *
 * These tests log in once via the UI and then exercise the API
 * surface through the test `request` fixture, attaching the
 * session cookie explicitly. We can't rely on
 * `page.context().request` because the session cookie is set
 * with `Secure` (NODE_ENV=production) and the e2e server is
 * plain HTTP, so the browser context drops the cookie when
 * the request is not HTTPS.
 */

test.describe("Supr Blueprint 5.0 HTTP routes", () => {
  // The unauthenticated /api/auth/status endpoint is reachable
  // before login; we just confirm the server is up.
  test.beforeEach(async ({ request }) => {
    const res = await request.get("/api/auth/status");
    expect(res.status()).toBe(200);
  });

  // Log in via the same UI flow the happy-path test uses, then
  // hand back a configured `request` fixture that carries the
  // session cookie on every call.
  async function loginAndGetRequest(
    page: Page,
    request: APIRequestContext,
  ): Promise<APIRequestContext | null> {
    await page.goto("/login");
    await page.getByLabel(/Master Access Key|Create Master Access Key/).fill("e2e-test-password");
    await page.getByRole("button", { name: /Authorize|Secure Node/i }).click();
    try {
      await expect(page).toHaveURL(/(\/|\?id=)/, { timeout: 10_000 });
    } catch {
      // Password isn't seeded in this environment; signal to skip.
      return null;
    }
    // Pull the session cookie out of the browser context and
    // attach it as an extra header on a derived request context.
    const cookies = await page.context().cookies();
    const session = cookies.find((c) => c.name === "supr_auth_token");
    if (!session) return null;
    return playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: `supr_auth_token=${session.value}` },
    });
  }

  test("PATCH /api/mcp/servers toggles a server and returns its id+enabled state", async ({ page, request }) => {
    const authed = await loginAndGetRequest(page, request);
    if (!authed) {
      test.skip();
      return;
    }

    // Pick a stable test target. The default registry always
    // includes `supr-internal` and `supr-skills` (both enabled).
    const id = "supr-skills";
    const before = await authed.get("/api/mcp/status");
    expect(before.status()).toBe(200);

    // Toggle off.
    const off = await authed.patch("/api/mcp/servers", { data: { id, enabled: false } });
    expect(off.status()).toBe(200);
    const offBody = await off.json();
    expect(offBody.id).toBe(id);
    expect(offBody.enabled).toBe(false);

    // Toggle back on.
    const on = await authed.patch("/api/mcp/servers", { data: { id, enabled: true } });
    expect(on.status()).toBe(200);
    const onBody = await on.json();
    expect(onBody.id).toBe(id);
    expect(onBody.enabled).toBe(true);
  });

  test("PATCH /api/mcp/servers rejects a malformed id", async ({ page, request }) => {
    const authed = await loginAndGetRequest(page, request);
    if (!authed) {
      test.skip();
      return;
    }
    const res = await authed.patch("/api/mcp/servers", { data: { id: "../etc/passwd", enabled: true } });
    expect(res.status()).toBe(400);
  });

  test("GET /api/skills/lessons returns a summary (possibly empty)", async ({ page, request }) => {
    const authed = await loginAndGetRequest(page, request);
    if (!authed) {
      test.skip();
      return;
    }
    const res = await authed.get("/api/skills/lessons");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("summary");
    expect(Array.isArray(body.summary)).toBe(true);
  });

  test("POST /api/skills/lessons rejects a malformed skill name", async ({ page, request }) => {
    const authed = await loginAndGetRequest(page, request);
    if (!authed) {
      test.skip();
      return;
    }
    const res = await authed.post("/api/skills/lessons", { data: { skill: "../../etc", keep: 5 } });
    expect(res.status()).toBe(400);
  });

  test("GET /api/context/compaction returns the current config", async ({ page, request }) => {
    const authed = await loginAndGetRequest(page, request);
    if (!authed) {
      test.skip();
      return;
    }
    const res = await authed.get("/api/context/compaction");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("config");
    expect(body.config).toHaveProperty("threshold");
    expect(body.config).toHaveProperty("window");
    expect(body.config).toHaveProperty("maxSummaryTokens");
  });

  test("POST /api/context/compaction update_config validates ranges", async ({ page, request }) => {
    const authed = await loginAndGetRequest(page, request);
    if (!authed) {
      test.skip();
      return;
    }
    const res = await authed.post("/api/context/compaction", {
      data: { action: "update_config", config: { threshold: 999_999, window: 1, maxSummaryTokens: 100 } },
    });
    expect(res.status()).toBe(400);
  });

  test("Telegram webhook refuses a forged POST without the secret token", async ({ request }) => {
    // The Telegram route does not require login (it authenticates
    // via the shared secret). The acceptable refusal responses are:
    //   - 200 with `ignored: true` if the operator has the Telegram
    //     channel disabled (the default in a fresh environment).
    //   - 401 if the secret is configured but missing/wrong.
    //   - 503 if the secret has not been configured and the
    //     channel is enabled.
    const res = await request.post("/api/telegram", {
      data: { message: { chat: { id: 1 }, text: "/start_flow" } },
    });
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("ignored", true);
      return;
    }
    expect([401, 503]).toContain(res.status());
  });
});
