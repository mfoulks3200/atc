/**
 * Baseline smoke tests for the ATC dashboard + daemon.
 *
 * These tests do not exercise every edge case — they assert that the
 * major top-level views render against a live daemon and that the
 * REST + WebSocket wiring is intact.
 */

import { test, expect } from "@playwright/test";
import { DEMO_PROJECT, DEMO_CRAFTS, seedDemoDataset, resetDemoDataset } from "../fixtures/seed.js";

test.describe("smoke", () => {
  test.beforeAll(async () => {
    await resetDemoDataset();
    await seedDemoDataset();
  });

  test("dashboard renders with seeded crafts", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Dashboard").first()).toBeVisible();
    await expect(page.getByText("ACTIVE CRAFTS").first()).toBeVisible();
    await expect(page.getByText("RECENT EVENTS").first()).toBeVisible();
  });

  test("projects list shows the seeded project", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByText(DEMO_PROJECT.name, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(DEMO_PROJECT.remoteUrl)).toBeVisible();
  });

  test("project detail links to crafts", async ({ page }) => {
    await page.goto(`/projects/${DEMO_PROJECT.name}`);
    for (const craft of DEMO_CRAFTS) {
      await expect(page.getByText(craft.callsign).first()).toBeVisible();
    }
  });

  test("craft detail renders flight plan", async ({ page }) => {
    const craft = DEMO_CRAFTS[0]!;
    await page.goto(`/projects/${DEMO_PROJECT.name}/crafts/${craft.callsign}`);
    await expect(page.getByText(craft.callsign).first()).toBeVisible();
    await expect(page.getByText(craft.flightPlan[0]!.name).first()).toBeVisible();
  });

  test("pilots list shows seeded pilots", async ({ page }) => {
    await page.goto("/pilots");
    await expect(page.getByText("amelia").first()).toBeVisible();
    await expect(page.getByText("chuck").first()).toBeVisible();
  });

  test("settings general, profile, and about pages render", async ({ page }) => {
    await page.goto("/settings/general");
    await expect(page.locator("main")).toBeVisible();

    await page.goto("/settings/profile");
    await expect(page.locator("main")).toBeVisible();

    await page.goto("/settings/about");
    await expect(page.locator("main")).toBeVisible();
  });

  test("project settings general page renders", async ({ page }) => {
    await page.goto(`/settings/project/${DEMO_PROJECT.name}/general`);
    await expect(page.locator("main")).toBeVisible();
  });

  test("creating a project via API reflects in the UI list", async ({ page, request }) => {
    const name = `adhoc-${Date.now()}`;
    const res = await request.post("/api/v1/projects", {
      data: {
        name,
        remoteUrl: "https://github.com/atc/adhoc.git",
        categories: ["feature"],
        checklist: [],
      },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto("/projects");
    await expect(page.getByText(name)).toBeVisible();

    await request.delete(`/api/v1/projects/${name}`);
  });
});
