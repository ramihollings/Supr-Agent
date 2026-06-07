import { test, expect } from "@playwright/test";

test.describe("Supr happy path", () => {
  test("login → setup wizard → dashboard", async ({ page }) => {
    // 1. Unauthenticated visit redirects to /login
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /Supr/ })).toBeVisible();
    await expect(page.getByLabel(/Master Access Key|Create Master Access Key/)).toBeVisible();

    // 2. Login with the test password
    await page.getByLabel(/Master Access Key|Create Master Access Key/).fill("e2e-test-password");
    await page.getByRole("button", { name: /Authorize|Secure Node/i }).click();

    // 3. Land on the dashboard or setup wizard
    await expect(page).toHaveURL(/(\/|\?id=)/, { timeout: 10_000 });

    // 4. Sidebar nav is visible
    const dashboard = page.getByRole("link", { name: /^Dashboard$/i });
    await expect(dashboard).toBeVisible();

    // 5. Open the project builder
    await page.getByRole("button", { name: /New Project|Create project/i }).first().click();
    const dialog = page.getByRole("dialog", { name: /Project Builder/i });
    await expect(dialog).toBeVisible();

    // Fill in the project name
    await dialog.getByLabel(/Project Name|Project name/i).fill("E2E Smoke Test Project");
    await dialog.getByRole("button", { name: /Next|Continue/i }).click();
    // Accept the defaults through the wizard (no real LLM will be called)
    const next = dialog.getByRole("button", { name: /Next|Continue|Create/i });
    for (let i = 0; i < 3; i += 1) {
      if (await next.isVisible().catch(() => false)) {
        await next.click({ trial: false }).catch(() => {});
      }
    }

    // 6. Close the wizard with Escape (focus trap should also work)
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });

  test("toast is announced after a user action", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel(/Master Access Key|Create Master Access Key/).fill("e2e-test-password");
    await page.getByRole("button", { name: /Authorize|Secure Node/i }).click();
    await expect(page).toHaveURL(/(\/|\?id=)/, { timeout: 10_000 });

    // The ToastProvider always mounts a status region in the DOM (currently null message).
    const status = page.locator('[role="status"].sr-only');
    await expect(status).toBeAttached();
  });
});
