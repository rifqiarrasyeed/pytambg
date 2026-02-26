import { expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.E2E_USER_EMAIL ?? "superadmin@mbg.local";
const PASSWORD = process.env.E2E_USER_PASSWORD ?? "Passw0rd!";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /Masuk/i }).click();
  await expect(page).toHaveURL(/\/(planning|reports)/, { timeout: 20_000 });
}

test("navigasi modul utama render normal dan aksi utama tersedia", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);

  const routes: Array<{ path: string; title: string; actionText: RegExp }> = [
    { path: "/planning", title: "Menu Planning & MRP", actionText: /Buat Plan|Submit Selected|Approve Selected/i },
    { path: "/procurement", title: "Procurement & Receiving", actionText: /Buat PO|Approve PO|Post GRN/i },
    { path: "/inventory", title: "Inventory & Opname", actionText: /Post Move|Buat Opname|Approve Opname/i },
    { path: "/production", title: "Production Run", actionText: /Buat Run|Start Run|Finalize Run/i },
    { path: "/delivery", title: "Distribusi", actionText: /Manifest|Verification Queue|Disputes/i },
    { path: "/reports", title: "Laporan", actionText: /Overview|Audit|Settings|Master Data/i }
  ];

  for (const route of routes) {
    await page.goto(route.path, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.getByText(route.title, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: route.actionText }).first()).toBeVisible({ timeout: 20_000 });
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
