import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Groom Book E2E tests.
 *
 * Targets the Docker Compose stack:
 *   - Web:  http://localhost:8080
 *   - API:  http://localhost:3000 (proxied via the web container's nginx)
 *
 * Run locally:
 *   docker compose up -d
 *   pnpm --filter @groombook/e2e test
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: "http://localhost:8080",
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
