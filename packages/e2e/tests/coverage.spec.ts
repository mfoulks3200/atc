/**
 * Extended coverage tests for navigation flows, craft lifecycle visibility,
 * empty state handling, error resilience, and responsive layout.
 *
 * These tests supplement the baseline smoke suite with flows that
 * verify core UI interactions beyond simple page-load checks. Runs
 * before smoke.spec.ts alphabetically, so each describe block that
 * needs seeded data owns its own beforeAll seed cycle.
 */

import { test, expect } from "@playwright/test";
import {
  DEMO_PROJECT,
  DEMO_CRAFTS,
  seedDemoDataset,
  resetDemoDataset,
  ensureProject,
  ensurePilot,
  ensureCraft,
} from "../fixtures/seed.js";

const API_BASE = process.env.ATC_DAEMON_URL ?? "http://127.0.0.1:7799";

/** Direct REST helper for beforeAll/afterAll (outside Playwright request context). */
async function apiPost(path: string, body?: unknown): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function apiDelete(path: string): Promise<void> {
  await fetch(`${API_BASE}${path}`, { method: "DELETE" });
}

// ─────────────────────────────────────────────
// Navigation flows
// ─────────────────────────────────────────────

test.describe("navigation", () => {
  test.beforeAll(async () => {
    await resetDemoDataset();
    await seedDemoDataset();
  });

  test("all main nav items are visible in the sidebar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Dashboard").first()).toBeVisible();
    await expect(page.getByText("Projects").first()).toBeVisible();
    await expect(page.getByText("Crafts").first()).toBeVisible();
    await expect(page.getByText("Pilots").first()).toBeVisible();
    await expect(page.getByText("Event Stream").first()).toBeVisible();
    await expect(page.getByText("Settings").first()).toBeVisible();
  });

  test("clicking nav links routes to correct pages", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Projects" }).first().click();
    await expect(page).toHaveURL(/\/projects$/);

    await page.getByRole("link", { name: "Crafts" }).first().click();
    await expect(page).toHaveURL(/\/crafts$/);

    await page.getByRole("link", { name: "Pilots" }).first().click();
    await expect(page).toHaveURL(/\/pilots$/);

    await page.getByRole("link", { name: "Settings" }).first().click();
    await expect(page).toHaveURL(/\/settings/);
  });

  test("project sub-nav appears when viewing a project detail page", async ({ page }) => {
    await page.goto(`/projects/${DEMO_PROJECT.name}`);
    await expect(page.getByText("← Back to Projects")).toBeVisible();
    await expect(page.getByText("⊡ Overview")).toBeVisible();
    await expect(page.getByText("⊘ Tower Queue")).toBeVisible();
  });

  test("settings sub-nav shows general, profile, and about sections", async ({ page }) => {
    await page.goto("/settings/general");
    await expect(page.getByText("General").first()).toBeVisible();
    await expect(page.getByText("Profile").first()).toBeVisible();
    await expect(page.getByText("About").first()).toBeVisible();
  });
});

// ─────────────────────────────────────────────
// All crafts view
// ─────────────────────────────────────────────

test.describe("all crafts view", () => {
  test.beforeAll(async () => {
    await resetDemoDataset();
    await seedDemoDataset();
  });

  test("crafts page renders with status filter tabs", async ({ page }) => {
    await page.goto("/crafts");
    await expect(page.getByText("All").first()).toBeVisible();
    await expect(page.getByText("Active").first()).toBeVisible();
    await expect(page.getByText("Landed").first()).toBeVisible();
    await expect(page.getByText("Trouble").first()).toBeVisible();
  });

  test("crafts page lists seeded crafts in the default view", async ({ page }) => {
    await page.goto("/crafts");
    for (const craft of DEMO_CRAFTS) {
      await expect(page.getByText(craft.callsign).first()).toBeVisible();
    }
  });
});

// ─────────────────────────────────────────────
// Craft lifecycle visibility
// ─────────────────────────────────────────────

const LIFECYCLE_PROJECT = {
  name: `lifecycle-${Date.now()}`,
  remoteUrl: "https://github.com/atc/lifecycle-test.git",
  categories: ["feature"],
};

const LIFECYCLE_PILOT = {
  identifier: "lifecycle-pilot",
  certifications: ["captain", "first-officer"],
};

const LIFECYCLE_CRAFT = {
  callsign: "LIFE-1",
  branch: "feat/lifecycle-test",
  cargo: "Test craft lifecycle visibility in the UI",
  category: "feature",
  captain: LIFECYCLE_PILOT.identifier,
  flightPlan: [
    { name: "First Vector", acceptanceCriteria: "Completed first milestone" },
    { name: "Second Vector", acceptanceCriteria: "Completed second milestone" },
  ],
};

test.describe("craft lifecycle visibility", () => {
  test.beforeAll(async () => {
    await ensureProject(LIFECYCLE_PROJECT);
    await ensurePilot(LIFECYCLE_PROJECT.name, LIFECYCLE_PILOT);
    await ensureCraft(LIFECYCLE_PROJECT.name, LIFECYCLE_CRAFT);
  });

  test.afterAll(async () => {
    await apiDelete(`/api/v1/projects/${LIFECYCLE_PROJECT.name}`);
  });

  test("newly created craft shows Taxiing status in craft detail", async ({ page }) => {
    await page.goto(`/projects/${LIFECYCLE_PROJECT.name}/crafts/${LIFECYCLE_CRAFT.callsign}`);
    await expect(page.getByText(LIFECYCLE_CRAFT.callsign).first()).toBeVisible();
    await expect(page.getByText("Taxiing").first()).toBeVisible();
  });

  test("launched craft shows InFlight status after API transition", async ({ page }) => {
    const res = await apiPost(
      `/api/v1/projects/${LIFECYCLE_PROJECT.name}/crafts/${LIFECYCLE_CRAFT.callsign}/launch`,
    );
    expect(res.ok).toBeTruthy();

    await page.goto(`/projects/${LIFECYCLE_PROJECT.name}/crafts/${LIFECYCLE_CRAFT.callsign}`);
    await expect(page.getByText("InFlight").first()).toBeVisible();
  });

  test("craft detail renders all flight plan vectors from seed data", async ({ page }) => {
    await page.goto(`/projects/${LIFECYCLE_PROJECT.name}/crafts/${LIFECYCLE_CRAFT.callsign}`);
    for (const vector of LIFECYCLE_CRAFT.flightPlan) {
      await expect(page.getByText(vector.name).first()).toBeVisible();
    }
  });
});

// ─────────────────────────────────────────────
// Empty state and error resilience
// ─────────────────────────────────────────────

test.describe("empty state and error resilience", () => {
  test("unknown route renders a page without crashing", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-abc123");
    // The React app shell should render even for unknown routes
    await expect(page.locator("body")).toBeVisible();
  });

  test("tower queue page renders for a project with no clearance requests", async ({ page }) => {
    await page.goto(`/projects/${DEMO_PROJECT.name}/tower`);
    await expect(page.locator("main")).toBeVisible();
  });
});

// ─────────────────────────────────────────────
// Responsive basics
// ─────────────────────────────────────────────

test.describe("responsive layout", () => {
  test.beforeAll(async () => {
    await resetDemoDataset();
    await seedDemoDataset();
  });

  test("dashboard renders key sections at mobile viewport (375×667)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await expect(page.getByText("Dashboard").first()).toBeVisible();
    await expect(page.getByText("ACTIVE CRAFTS").first()).toBeVisible();
  });

  test("projects list renders at mobile viewport (375×667)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/projects");
    await expect(page.getByText(DEMO_PROJECT.name, { exact: false }).first()).toBeVisible();
  });

  test("crafts list renders at mobile viewport (375×667)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/crafts");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByText(DEMO_CRAFTS[0]!.callsign).first()).toBeVisible();
  });
});
