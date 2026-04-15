/**
 * Deterministic test data and REST seeding helpers for the e2e suite.
 *
 * The seed functions talk directly to the daemon REST API so UI flows
 * can assume pre-populated state instead of walking through every form.
 */

const API_BASE = process.env.ATC_DAEMON_URL ?? "http://127.0.0.1:7799";

export interface SeedProject {
  name: string;
  remoteUrl: string;
  categories: string[];
}

export interface SeedPilot {
  identifier: string;
  certifications: string[];
}

export interface SeedCraft {
  callsign: string;
  branch: string;
  cargo: string;
  category: string;
  captain: string;
  flightPlan: Array<{ name: string; acceptanceCriteria: string }>;
}

export const DEMO_PROJECT: SeedProject = {
  name: "demo",
  remoteUrl: "https://github.com/atc/demo.git",
  categories: ["feature", "bugfix"],
};

export const DEMO_PILOTS: SeedPilot[] = [
  { identifier: "amelia", certifications: ["captain", "first-officer"] },
  { identifier: "bessie", certifications: ["first-officer"] },
  { identifier: "chuck", certifications: ["captain"] },
];

export const DEMO_CRAFTS: SeedCraft[] = [
  {
    callsign: "ATC-101",
    branch: "feat/telemetry-overlay",
    cargo: "Add live telemetry overlay to the dashboard flight radar",
    category: "feature",
    captain: "amelia",
    flightPlan: [
      { name: "Design overlay layout", acceptanceCriteria: "Mockups approved and linked in cargo" },
      { name: "Wire WebSocket source", acceptanceCriteria: "Live craft events update overlay at 1Hz" },
      { name: "Document usage", acceptanceCriteria: "README screenshot and caption updated" },
    ],
  },
  {
    callsign: "ATC-202",
    branch: "fix/landing-checklist-timeout",
    cargo: "Checklist runner hangs when a step exceeds its timeout",
    category: "bugfix",
    captain: "chuck",
    flightPlan: [
      { name: "Reproduce locally", acceptanceCriteria: "Failing test committed" },
      { name: "Apply fix", acceptanceCriteria: "Failing test now passes" },
    ],
  },
];

async function request(method: string, path: string, body?: unknown): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res;
}

export async function ensureProject(project: SeedProject = DEMO_PROJECT): Promise<void> {
  await request("POST", "/api/v1/projects", {
    name: project.name,
    remoteUrl: project.remoteUrl,
    categories: project.categories,
    checklist: [],
  });
}

export async function ensurePilot(projectName: string, pilot: SeedPilot): Promise<void> {
  await request("POST", `/api/v1/projects/${projectName}/pilots`, {
    identifier: pilot.identifier,
    certifications: pilot.certifications,
  });
}

export async function ensureCraft(projectName: string, craft: SeedCraft): Promise<void> {
  await request("POST", `/api/v1/projects/${projectName}/crafts`, craft);
}

export async function seedDemoDataset(): Promise<void> {
  await ensureProject(DEMO_PROJECT);
  for (const pilot of DEMO_PILOTS) {
    await ensurePilot(DEMO_PROJECT.name, pilot);
  }
  for (const craft of DEMO_CRAFTS) {
    await ensureCraft(DEMO_PROJECT.name, craft);
  }
}

export async function resetDemoDataset(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/projects/${DEMO_PROJECT.name}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`reset failed: ${res.status}`);
  }
}
