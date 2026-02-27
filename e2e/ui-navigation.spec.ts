import { expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.E2E_WEB_USER_EMAIL ?? process.env.E2E_USER_EMAIL ?? "superadmin@mbg.local";
const PASSWORD = process.env.E2E_WEB_USER_PASSWORD ?? process.env.E2E_USER_PASSWORD ?? "Passw0rd!";

async function login(page: Page): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.context().clearCookies();
      const response = await page.request.post("/api/auth/login", {
        data: { email: EMAIL, password: PASSWORD }
      });
      expect(response.ok(), await response.text()).toBe(true);
      await page.goto("/planning", { waitUntil: "domcontentloaded", timeout: 30_000 });
      await expect
        .poll(() => new URL(page.url()).pathname, { timeout: 20_000 })
        .toMatch(/^\/(planning|reports)$/);
      if (new URL(page.url()).pathname === "/login") {
        throw new Error("Login API fallback tidak menghasilkan sesi browser, mencoba login via UI.");
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.getByLabel("Email").fill(EMAIL);
        await page.getByLabel("Password").fill(PASSWORD);
        await page.getByRole("button", { name: /Masuk|Login|Sign in/i }).first().click();
        await expect
          .poll(() => new URL(page.url()).pathname, { timeout: 20_000 })
          .toMatch(/^\/(planning|reports)$/);
        return;
      }
    }
  }
  throw lastError;
}

async function gotoWithRetry(page: Page, path: string, timeout: number): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded", timeout });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await page.waitForTimeout(1000);
      }
    }
  }
  throw lastError;
}

test("navigasi modul utama render normal dan aksi utama tersedia", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);

  const routes: Array<{ path: string; title: string; actionText: RegExp; timeout?: number }> = [
    { path: "/planning", title: "Menu Planning & MRP", actionText: /Buat Plan|Submit Selected|Approve Selected/i },
    { path: "/procurement", title: "Procurement & Receiving", actionText: /Buat PO|Approve PO|Post GRN/i },
    { path: "/inventory", title: "Inventory & Opname", actionText: /Post Move|Buat Opname|Approve Opname/i },
    { path: "/production", title: "Production Run", actionText: /Buat Run|Start Run|Finalize Run/i },
    { path: "/delivery", title: "Distribusi", actionText: /Manifest|Verification Queue|Disputes/i },
    { path: "/reports", title: "Laporan", actionText: /Overview|Audit|Settings|Master Data|Refresh/i, timeout: 120_000 }
  ];

  for (const route of routes) {
    await gotoWithRetry(page, route.path, route.timeout ?? 60_000);
    await expect(page.getByText(route.title, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    if (route.path === "/reports") {
      await expect(page.getByText(route.actionText).first()).toBeVisible({ timeout: 20_000 });
    } else {
      await expect(page.getByRole("button", { name: route.actionText }).first()).toBeVisible({ timeout: 20_000 });
    }
  }

  const themeButton = page.getByRole("button", { name: /(Light|Dark|System)/i }).first();
  await expect(themeButton).toBeVisible();
});

test("route legacy otomatis diarahkan ke route baru", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);

  await page.goto("/verification", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/delivery\?tab=verification/);

  await page.goto("/disputes", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/delivery\?tab=disputes/);

  await page.goto("/audit", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/reports\?tab=audit/);

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/(planning|reports)/);
});

test("route /app/* sebagai compatibility redirect ke canonical", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);

  await page.goto("/app", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/planning/);

  await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/planning/);

  await page.goto("/app/plans", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/planning/);

  await page.goto("/app/production", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/production/);

  await page.goto("/app/deliveries", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/delivery/);

  await page.goto("/app/reports", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/reports/);
});
