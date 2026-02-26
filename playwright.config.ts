import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const useProdServer = process.env.E2E_USE_PROD === "1";
const e2eEnv = {
  ...process.env,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "http://localhost:3001"
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: process.env.E2E_WEB_BASE_URL ?? "http://localhost:3001",
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
      command: useProdServer ? "npm run start" : "npm run dev",
      url: "http://localhost:3000/health",
      reuseExistingServer: false,
      timeout: useProdServer ? 180_000 : 120_000,
      env: e2eEnv
    },
    {
      command: useProdServer ? "npm run web:start" : "npm run web:dev",
      url: "http://localhost:3001/login",
      reuseExistingServer: false,
      timeout: useProdServer ? 240_000 : 120_000,
      env: e2eEnv
    }
  ]
});
