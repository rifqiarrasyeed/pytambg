import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const reuseExistingServer = !process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: process.env.E2E_WEB_BASE_URL ?? "http://127.0.0.1:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: [
    {
      command: "npm run dev",
      url: "http://127.0.0.1:3000/health",
      reuseExistingServer,
      timeout: 120_000
    },
    {
      command: "npm run web:dev",
      url: "http://127.0.0.1:3001/login",
      reuseExistingServer,
      timeout: 120_000
    }
  ]
});
