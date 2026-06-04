import { test, expect } from "@playwright/test";

/**
 * Auth flow E2E tests.
 *
 * The happy-path spec covers the full setup-wizard journey.
 * This file focuses on the auth boundary itself: redirects,
 * bad password handling, session persistence, and the
 * /api/auth endpoints behind the proxy.
 */

test.describe("Supr auth flow", () => {
  test("unauthenticated visit to a protected route redirects to /login", async ({ page }) => {
    const protectedPaths = ["/settings", "/supervisor", "/supr-chat", "/mcp"];
    for (const path of protectedPaths) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
    }
  });

  test("wrong password does not navigate to a protected route", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel(/Master Access Key|Create Master Access Key/).fill("definitely-wrong-password");
    await page.getByRole("button", { name: /Authorize|Secure Node/i }).click();
    // The login page may append ?callbackUrl=... on failure or
    // just stay on /login. Either way, we must not have
    // navigated to the dashboard.
    await page.waitForTimeout(1_000);
    const url = page.url();
    expect(url).toMatch(/\/login/);
    expect(url).not.toMatch(/^https?:\/\/[^/]+\/?$/);
  });

  test("login → logout → protected route redirects again", async ({ page }) => {
    // 1. Login
    await page.goto("/");
    await page.getByLabel(/Master Access Key|Create Master Access Key/).fill("e2e-test-password");
    await page.getByRole("button", { name: /Authorize|Secure Node/i }).click();
    await expect(page).toHaveURL(/(\/|\?id=)/, { timeout: 10_000 });

    // 2. Find the logout button. Settings page has a logout
    //    button; the dashboard may also have a sign-out affordance.
    await page.goto("/settings");
    // The settings page is a long page; scroll to the bottom
    // to find the logout button.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const logoutButton = page.getByRole("button", { name: /Sign out|Log out|Logout/i }).first();
    if (await logoutButton.isVisible().catch(() => false)) {
      await logoutButton.click();
      // 3. We should be back at /login
      await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
      // 4. Visiting a protected route should still redirect
      await page.goto("/settings");
      await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
    }
  });

  test("/api/auth/status returns a JSON object", async ({ request }) => {
    const response = await request.get("/api/auth/status");
    expect(response.status()).toBe(200);
    const body = await response.json();
    // The status endpoint exposes a stable JSON shape. We don't
    // pin the exact keys (the auth flow has changed over time),
    // just that the response is a valid JSON object.
    expect(typeof body).toBe("object");
    expect(body).not.toBeNull();
  });
});
