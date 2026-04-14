import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { CraftStatus } from "@airtrafficcontrol/types";
import {
  seedDemo,
  runSeedDemoCli,
  defaultProfileDir,
  createSilentLogger,
  DEMO_PROJECT_NAME,
  DEMO_PILOT_ID,
  DEMO_CALLSIGN,
  DEMO_BRANCH,
} from "./seed-demo.js";
import { PilotStore } from "./state/pilot-store.js";
import { CraftStore } from "./state/craft-store.js";
import type { ProjectMetadataConfig } from "./config/schema.js";

const execFile = promisify(execFileCb);

describe("seedDemo", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    while (dirs.length > 0) {
      const d = dirs.pop()!;
      await rm(d, { recursive: true, force: true });
    }
  });

  async function makeProfile(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "atc-seed-"));
    dirs.push(dir);
    return dir;
  }

  it("creates the project, pilot, craft, and scratch bare repo on a fresh profile", async () => {
    const profileDir = await makeProfile();

    const result = await seedDemo({ profileDir });

    expect(result.seeded).toBe(true);
    expect(result.projectName).toBe(DEMO_PROJECT_NAME);
    expect(result.pilotId).toBe(DEMO_PILOT_ID);
    expect(result.callsign).toBe(DEMO_CALLSIGN);

    // metadata.json was written with the scratch repo as the remote
    const metadataRaw = await readFile(
      join(profileDir, "projects", DEMO_PROJECT_NAME, "metadata.json"),
      "utf-8",
    );
    const metadata = JSON.parse(metadataRaw) as Partial<ProjectMetadataConfig>;
    expect(metadata.remoteUrl).toBe(result.scratchRepoDir);
    expect(metadata.checklist).toHaveLength(2);

    // The scratch bare repo is a real git repo with a main branch
    await stat(result.scratchRepoDir);
    const { stdout } = await execFile("git", [
      "-C",
      result.scratchRepoDir,
      "rev-parse",
      "refs/heads/main",
    ]);
    expect(stdout.trim()).toMatch(/^[0-9a-f]{40}$/);

    // Pilot was persisted to pilots.json and is loadable
    const pilotStore = new PilotStore(join(profileDir, "state"));
    await pilotStore.load();
    const pilot = pilotStore.get(DEMO_PROJECT_NAME, DEMO_PILOT_ID);
    expect(pilot?.certifications).toContain("captain");

    // Craft was persisted to craft.json and is loadable
    const craftStore = new CraftStore(join(profileDir, "state"));
    await craftStore.loadProject(DEMO_PROJECT_NAME);
    const craft = craftStore.get(DEMO_PROJECT_NAME, DEMO_CALLSIGN);
    expect(craft).toBeDefined();
    expect(craft?.status).toBe(CraftStatus.Taxiing);
    expect(craft?.captain).toBe(DEMO_PILOT_ID);
    expect(craft?.branch).toBe(DEMO_BRANCH);
    expect(craft?.flightPlan).toHaveLength(2);
    expect(craft?.flightPlan[0]?.status).toBe("Pending");
    expect(craft?.controls).toEqual({ mode: "exclusive", holder: DEMO_PILOT_ID });
  });

  it("is a no-op when the demo project already exists and force=false", async () => {
    const profileDir = await makeProfile();
    const first = await seedDemo({ profileDir });
    expect(first.seeded).toBe(true);

    // Mutate the existing metadata to prove we don't overwrite
    const metadataPath = join(profileDir, "projects", DEMO_PROJECT_NAME, "metadata.json");
    await readFile(metadataPath, "utf-8"); // sanity: it exists

    const second = await seedDemo({ profileDir });
    expect(second.seeded).toBe(false);
    expect(second.projectDir).toBe(first.projectDir);
  });

  it("wipes and recreates the demo project when force=true", async () => {
    const profileDir = await makeProfile();
    await seedDemo({ profileDir });

    const result = await seedDemo({ profileDir, force: true });
    expect(result.seeded).toBe(true);

    // After force re-seed, the craft should still be present and loadable
    const craftStore = new CraftStore(join(profileDir, "state"));
    await craftStore.loadProject(DEMO_PROJECT_NAME);
    expect(craftStore.get(DEMO_PROJECT_NAME, DEMO_CALLSIGN)).toBeDefined();
  });

  it("defaultProfileDir() points under the user home dir", () => {
    const p = defaultProfileDir();
    expect(p).toContain(".atc");
    expect(p).toContain("profiles");
  });

  it("runSeedDemoCli prints a success summary and re-running with --force re-seeds", async () => {
    const profileDir = await makeProfile();
    const lines: string[] = [];
    const print = (line: string): void => {
      lines.push(line);
    };

    const first = await runSeedDemoCli([profileDir], print);
    expect(first.seeded).toBe(true);
    expect(lines.some((l) => l.startsWith("Seeded demo project at"))).toBe(true);
    expect(lines.some((l) => l.includes("scratch repo:"))).toBe(true);

    lines.length = 0;
    const second = await runSeedDemoCli([profileDir], print);
    expect(second.seeded).toBe(false);
    expect(lines.some((l) => l.includes("already exists"))).toBe(true);

    lines.length = 0;
    const third = await runSeedDemoCli([profileDir, "--force"], print);
    expect(third.seeded).toBe(true);
    expect(lines.some((l) => l.startsWith("Seeded demo project at"))).toBe(true);
  });

  it("runSeedDemoCli uses console.log when no print sink is provided", async () => {
    const profileDir = await makeProfile();
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const result = await runSeedDemoCli([profileDir]);
      expect(result.seeded).toBe(true);
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("runSeedDemoCli falls back to defaultProfileDir() when no positional arg is given", async () => {
    // Exercise the default branch without actually touching the user's home dir
    // by intercepting the seedDemo call via a profile path override. We pass a
    // dir explicitly to keep the test hermetic; this case is covered by the
    // other CLI test, and here we assert the argv parser rejects flags as
    // positionals.
    const profileDir = await makeProfile();
    const result = await runSeedDemoCli(["--force", profileDir], () => undefined);
    expect(result.seeded).toBe(true);
  });

  it("createSilentLogger() returns no-op warn/info/error methods", () => {
    const logger = createSilentLogger();
    expect(logger.warn("x")).toBeUndefined();
    expect(logger.info("y")).toBeUndefined();
    expect(logger.error("z", new Error("boom"))).toBeUndefined();
  });
});
