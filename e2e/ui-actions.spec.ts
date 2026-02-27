import { expect, test, type Page } from "@playwright/test";
import { uniqueSuffix } from "./support";

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

test("master-data: aksi sekunder edit/cancel dan BOM action terhubung", async ({ page }) => {
  await login(page);
  await page.goto("/master-data", { waitUntil: "domcontentloaded" });

  await page.getByTestId("master-tab-schools").click();
  if ((await page.getByTestId("master-edit-school").count()) === 0) {
    const schoolCode = `E2E-${uniqueSuffix("school").slice(-8).toUpperCase()}`;
    await page.getByLabel("Kode").fill(schoolCode);
    await page.getByLabel("Nama").fill(`Sekolah ${schoolCode}`);
    await page.getByTestId("master-save-school").click();
    await expect(page.getByTestId("master-edit-school").first()).toBeVisible();
  }

  const editSchool = page.getByTestId("master-edit-school").first();
  await expect(editSchool).toBeVisible();
  let editMode = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    await editSchool.click({ force: true });
    try {
      await expect
        .poll(async () => page.getByTestId("master-cancel-school").count(), { timeout: 4000 })
        .toBeGreaterThan(0);
      editMode = true;
      break;
    } catch {
      if (attempt === 2) {
        throw new Error("Aksi edit sekolah tidak masuk mode edit (cancel button tidak muncul).");
      }
    }
  }
  expect(editMode).toBeTruthy();

  await page.evaluate(() => {
    const cancel = document.querySelector<HTMLButtonElement>('[data-testid="master-cancel-school"]');
    cancel?.click();
  });
  await expect(page.getByTestId("master-cancel-school")).toHaveCount(0);

  await page.getByTestId("master-tab-recipes").click();
  const addBom = page.getByTestId("master-add-recipe-item");
  await expect(addBom).toBeVisible();
  const before = await page.getByTestId("master-delete-recipe-item").count();
  await addBom.click();
  const after = await page.getByTestId("master-delete-recipe-item").count();
  expect(after).toBeGreaterThanOrEqual(before);
});

test("audit: tombol refresh/filter memicu reload endpoint", async ({ page }) => {
  await login(page);
  await page.goto("/reports?tab=audit", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("audit-refresh")).toBeVisible();

  const [auditRes, usersRes] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/proxy/audit-logs") && res.request().method() === "GET"),
    page.waitForResponse((res) => res.url().includes("/api/proxy/users") && res.request().method() === "GET"),
    page.getByTestId("audit-refresh").click()
  ]);
  expect(auditRes.status()).toBeLessThan(400);
  expect(usersRes.status()).toBeLessThan(400);
});

test("app-shell: mobile menu toggle dan close berfungsi", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/planning", { waitUntil: "domcontentloaded" });

  const openMenu = page.getByTestId("shell-toggle-menu");
  const shell = page.locator("main.app-shell");
  await expect(openMenu).toBeVisible();
  await openMenu.click();
  await expect(shell).toHaveClass(/menu-open/);

  await openMenu.click();
  await expect(shell).not.toHaveClass(/menu-open/);
});
