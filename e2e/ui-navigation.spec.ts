import { expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.E2E_USER_EMAIL ?? "superadmin@mbg.local";
const PASSWORD = process.env.E2E_USER_PASSWORD ?? "Passw0rd!";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /Masuk/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}

test("navigasi modul utama render normal dan aksi utama tersedia", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);

  const routes: Array<{ path: string; title: string; actionText: RegExp }> = [
    { path: "/dashboard", title: "Dashboard Operasional", actionText: /Refresh|Terapkan/i },
    { path: "/planning", title: "Menu Planning & MRP", actionText: /Buat Plan|Submit Selected|Approve Selected/i },
    { path: "/procurement", title: "Procurement & Receiving", actionText: /Buat PO|Approve PO|Post GRN/i },
    { path: "/inventory", title: "Inventory & Opname", actionText: /Post Move|Buat Opname|Approve Opname/i },
    { path: "/production", title: "Production Run", actionText: /Buat Run|Start Run|Finalize Run/i },
    { path: "/delivery", title: "Delivery & Chain of Custody", actionText: /Buat Manifest|Update Status|Upload Proof/i },
    { path: "/verification", title: "School Verification", actionText: /Verify Stop|Refresh/i },
    { path: "/disputes", title: "Dispute Management", actionText: /Create Dispute|Resolve Selected/i },
    { path: "/incidents", title: "Incident, Waste & Recall", actionText: /Simpan Waste|Simpan Incident/i },
    { path: "/reports", title: "Reports & Export Jobs", actionText: /Generate Export|Signed URL|Muat KPI/i },
    { path: "/audit", title: "Audit Trail", actionText: /Filter|Refresh/i },
    { path: "/settings", title: "SPPG Settings", actionText: /Simpan Versi Baru|Reload/i },
    { path: "/master-data", title: "Master Data Operasional", actionText: /Simpan|Update|Tambah/i },
    { path: "/sppg-admin", title: "Admin Pusat SPPG", actionText: /Tambah SPPG|Update SPPG|Simpan Assignment/i }
  ];

  for (const route of routes) {
    await page.goto(route.path, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.getByText(route.title, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: route.actionText }).first()).toBeVisible({ timeout: 20_000 });
  }

  const themeButton = page.getByRole("button", { name: /(Light|Dark|System)/i }).first();
  await expect(themeButton).toBeVisible();
});
