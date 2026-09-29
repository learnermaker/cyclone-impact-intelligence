import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the Cyclone Impact Intelligence golden-path E2E test.
 *
 * The test runs against a local development server.
 * Start the server with `pnpm dev` before running `pnpm test:e2e`.
 *
 * For CI: set `CI=true` and the test will attempt to start the server automatically.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  timeout: 120_000,    // 2 minutes per test (engine startup + fixture load)
  expect: { timeout: 30_000 },

  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,         // Serial — single server instance

  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // In CI, auto-start the dev server
  webServer: process.env.CI
    ? {
        command: "pnpm dev",
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: "ignore",
        stderr: "pipe",
      }
    : undefined,
});
