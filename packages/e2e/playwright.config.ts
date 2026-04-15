/**
 * Playwright configuration for the @airtrafficcontrol/e2e package.
 *
 * Two child processes are started before the test run:
 *  1. `run-daemon.ts` — boots the daemon against a scratch profile.
 *  2. `vite preview` (web package) — serves the built dashboard bundle
 *     and proxies `/api` + `/ws` to the daemon.
 *
 * The Playwright runner is Chromium-only per project convention. CI
 * integration is deferred; tests are expected to run via
 * `pnpm --filter @airtrafficcontrol/e2e test` from a developer machine.
 */

import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, "..", "web");

const DAEMON_PORT = Number(process.env.ATC_E2E_DAEMON_PORT ?? 7799);
const WEB_PORT = Number(process.env.ATC_E2E_WEB_PORT ?? 4173);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "./test-results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `node --import tsx ${resolve(here, "scripts", "run-daemon.ts")}`,
      url: `http://127.0.0.1:${DAEMON_PORT}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        ATC_E2E_DAEMON_PORT: String(DAEMON_PORT),
      },
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `pnpm --filter @airtrafficcontrol/web preview --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      cwd: webDir,
      env: {
        ATC_DAEMON_URL: `http://127.0.0.1:${DAEMON_PORT}`,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
