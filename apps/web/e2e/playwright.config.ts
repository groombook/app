import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for GroomBook Web E2E tests.
 *
 * Targets the deployed dev environment at groombook.dev.farh.net.
 * Uses the dev login selector (/login) for authentication — no hardcoded credentials.
 *
 * Run locally:
 *   pnpm --filter @groombook/web-e2e test
 *
 * CI: Runs on every PR targeting main, blocking merge on failure.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: "https://groombook.dev.farh.net",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});