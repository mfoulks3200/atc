/**
 * Screenshot capture suite for repository documentation.
 *
 * Seeds a deterministic demo dataset, navigates to the views featured
 * in the README, and writes PNGs under `packages/e2e/screenshots/`.
 * Run with:
 *
 *   pnpm --filter @airtrafficcontrol/e2e test:screenshots
 */

import { test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { DEMO_PROJECT, DEMO_CRAFTS, seedDemoDataset, resetDemoDataset } from "../fixtures/seed.js";

const here = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(here, "..", "screenshots");

test.describe.configure({ mode: "serial" });

test.describe("readme screenshots", () => {
  test.beforeAll(async () => {
    await mkdir(OUTPUT_DIR, { recursive: true });
    await resetDemoDataset();
    await seedDemoDataset();
  });

  test("dashboard", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: resolve(OUTPUT_DIR, "dashboard.png"),
      fullPage: true,
    });
  });

  test("craft detail", async ({ page }) => {
    const craft = DEMO_CRAFTS[0]!;
    await page.goto(`/projects/${DEMO_PROJECT.name}/crafts/${craft.callsign}`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: resolve(OUTPUT_DIR, "craft-detail.png"),
      fullPage: true,
    });
  });
});
