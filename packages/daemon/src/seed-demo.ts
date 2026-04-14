/**
 * First-run seeding helper for the ATC daemon.
 *
 * Creates a throwaway "demo" project with one captain pilot and a sample
 * two-vector flight plan pointing at a local scratch bare repo. Safe to run
 * against a fresh daemon profile so a new user has something to look at
 * instead of empty screens.
 *
 * The seeder writes directly to the same on-disk layout the daemon uses
 * (metadata.json via the project config store, pilots.json via PilotStore,
 * craft.json via CraftStore) so a daemon started against the same profile
 * picks the seeded state up on boot.
 *
 * @see RULE-CRAFT-1 for craft/project correspondence.
 * @see RULE-PILOT-1 for pilot identity rules.
 */

import { execFile as execFileCb } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { CraftStatus } from "@airtrafficcontrol/types";
import { initBareRepo } from "./git/bare-repo.js";
import { createProjectConfigStore } from "./config/project-store.js";
import { PilotStore } from "./state/pilot-store.js";
import { CraftStore } from "./state/craft-store.js";
import type { ConfigLogger } from "./config/layered-store.js";
import type { CraftState, PilotRecord, VectorState } from "./types.js";
import type { ProjectMetadataConfig } from "./config/schema.js";

/** Fixed name for the seeded demo project. */
export const DEMO_PROJECT_NAME = "demo";
/** Fixed pilot identifier for the seeded captain. */
export const DEMO_PILOT_ID = "demo-captain";
/** Fixed callsign for the seeded craft. */
export const DEMO_CALLSIGN = "demo-flight-001";
/** Fixed branch name the demo craft is tied to. */
export const DEMO_BRANCH = "demo/first-flight";

/**
 * Options controlling {@link seedDemo}.
 */
export interface SeedDemoOptions {
  /** Absolute path to the profile directory to seed into. */
  profileDir: string;
  /**
   * If true and the demo project already exists, wipe and recreate it.
   * Defaults to false (seeding is a no-op when the project is present).
   */
  force?: boolean;
}

/**
 * Result returned from {@link seedDemo} describing what was written.
 */
export interface SeedDemoResult {
  /** Whether any files were written (false if the demo already existed and force=false). */
  seeded: boolean;
  /** Absolute path to the scratch bare repo used as the project remote. */
  scratchRepoDir: string;
  /** Absolute path to the created project directory. */
  projectDir: string;
  /** Name of the seeded project. */
  projectName: string;
  /** Identifier of the seeded captain pilot. */
  pilotId: string;
  /** Callsign of the seeded craft. */
  callsign: string;
}

const execFile = promisify(execFileCb);

/**
 * Returns a silent {@link ConfigLogger} whose `warn`, `info`, and `error`
 * methods are no-ops. Used by {@link seedDemo} when driving the project
 * config store — all diagnostics are handled by the caller instead.
 */
export function createSilentLogger(): ConfigLogger {
  return {
    warn: () => undefined,
    info: () => undefined,
    error: () => undefined,
  };
}

/**
 * Initializes a local scratch bare repo with one initial commit on `main`.
 *
 * Worktree creation requires the bare repo to have at least one ref, so we
 * clone a throwaway working tree, commit a README, and push it back.
 *
 * @param scratchRepoDir - Directory where the bare repo will live.
 * @param workDir - Temporary working directory used for the bootstrap commit.
 */
async function initScratchRepo(scratchRepoDir: string, workDir: string): Promise<void> {
  await initBareRepo(scratchRepoDir);
  await mkdir(workDir, { recursive: true });
  await execFile("git", ["clone", scratchRepoDir, workDir]);
  await writeFile(
    join(workDir, "README.md"),
    "# ATC Demo Scratch Repo\n\nCreated by `pnpm run seed:demo`.\n",
    "utf-8",
  );
  await execFile("git", ["-C", workDir, "add", "README.md"]);
  await execFile("git", ["-C", workDir, "-c", "user.email=seed@atc.local", "-c", "user.name=ATC Seed", "commit", "-m", "seed: initial commit"]);
  await execFile("git", ["-C", workDir, "branch", "-M", "main"]);
  await execFile("git", ["-C", workDir, "push", "origin", "main"]);
}

/**
 * Seeds a profile directory with a demo project, pilot, and craft.
 *
 * Writes:
 * - `<profileDir>/scratch/demo-repo.git` — a local bare repo with one commit
 * - `<profileDir>/projects/demo/metadata.json` — project metadata
 * - `<profileDir>/state/pilots.json` — appends demo captain pilot
 * - `<profileDir>/state/projects/demo/crafts/demo-flight-001/craft.json` — craft state
 *
 * Idempotent with `force=false` (default): if the demo project directory
 * already exists, the seeder returns `{ seeded: false }` without touching
 * anything. Pass `force=true` to wipe and recreate.
 *
 * @param options - Seed configuration (see {@link SeedDemoOptions}).
 * @returns A {@link SeedDemoResult} describing the seeded paths.
 *
 * @see RULE-CRAFT-1
 * @see RULE-PILOT-1
 */
export async function seedDemo(options: SeedDemoOptions): Promise<SeedDemoResult> {
  const profileDir = resolve(options.profileDir);
  const force = options.force ?? false;

  const projectDir = join(profileDir, "projects", DEMO_PROJECT_NAME);
  const scratchRoot = join(profileDir, "scratch");
  const scratchRepoDir = join(scratchRoot, "demo-repo.git");
  const scratchWorkDir = join(scratchRoot, "demo-repo.work");
  const stateDir = join(profileDir, "state");

  const existing = await pathExists(projectDir);
  if (existing && !force) {
    return {
      seeded: false,
      scratchRepoDir,
      projectDir,
      projectName: DEMO_PROJECT_NAME,
      pilotId: DEMO_PILOT_ID,
      callsign: DEMO_CALLSIGN,
    };
  }

  if (existing) {
    await rm(projectDir, { recursive: true, force: true });
    await rm(scratchRoot, { recursive: true, force: true });
    await rm(join(stateDir, "projects", DEMO_PROJECT_NAME), { recursive: true, force: true });
  }

  await mkdir(join(projectDir, "crafts"), { recursive: true });
  await mkdir(stateDir, { recursive: true });

  await initScratchRepo(scratchRepoDir, scratchWorkDir);
  await rm(scratchWorkDir, { recursive: true, force: true });

  const projectStore = createProjectConfigStore(
    DEMO_PROJECT_NAME,
    projectDir,
    () => undefined,
    createSilentLogger(),
  );
  await projectStore.load();
  const metadata: ProjectMetadataConfig = {
    name: DEMO_PROJECT_NAME,
    remoteUrl: scratchRepoDir,
    categories: ["demo"],
    checklist: [
      { name: "Tests", command: "echo 'demo tests passed'" },
      { name: "Lint", command: "echo 'demo lint passed'" },
    ],
    mcpServers: {},
  };
  await projectStore.replace(metadata);

  const pilotStore = new PilotStore(stateDir);
  await pilotStore.load();
  const pilot: PilotRecord = {
    identifier: DEMO_PILOT_ID,
    certifications: ["captain", "firstOfficer"],
    mcpServers: {},
  };
  pilotStore.set(DEMO_PROJECT_NAME, pilot);
  await pilotStore.save();

  const craftStore = new CraftStore(stateDir);
  const vectors: VectorState[] = [
    {
      name: "Draft design doc",
      acceptanceCriteria: "A design.md file exists at the repo root describing the approach.",
      status: "Pending",
    },
    {
      name: "Implement greeting",
      acceptanceCriteria: "A hello.txt file exists at the repo root containing a greeting.",
      status: "Pending",
    },
  ];
  const craft: CraftState = {
    callsign: DEMO_CALLSIGN,
    createdAt: new Date().toISOString(),
    branch: DEMO_BRANCH,
    cargo: "Demo flight seeded by pnpm run seed:demo.",
    category: "demo",
    status: CraftStatus.Taxiing,
    captain: DEMO_PILOT_ID,
    firstOfficers: [],
    jumpseaters: [],
    flightPlan: vectors,
    blackBox: [],
    intercom: [],
    controls: { mode: "exclusive", holder: DEMO_PILOT_ID },
    holdingPattern: false,
  };
  craftStore.set(DEMO_PROJECT_NAME, craft);
  await craftStore.save(DEMO_PROJECT_NAME, DEMO_CALLSIGN);

  return {
    seeded: true,
    scratchRepoDir,
    projectDir,
    projectName: DEMO_PROJECT_NAME,
    pilotId: DEMO_PILOT_ID,
    callsign: DEMO_CALLSIGN,
  };
}

/**
 * Returns true if a path exists on disk.
 */
async function pathExists(p: string): Promise<boolean> {
  try {
    const { stat } = await import("node:fs/promises");
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves the default profile directory used by the CLI entry point,
 * matching `start.ts`: `~/.atc/profiles/default`.
 */
export function defaultProfileDir(): string {
  return join(homedir(), ".atc", "profiles", "default");
}

/**
 * Print sink used by {@link runSeedDemoCli}. Defaults to `console.log` in
 * the CLI entry point; tests inject a capturing function.
 */
export type CliPrinter = (line: string) => void;

/**
 * CLI driver for `pnpm run seed:demo`.
 *
 * Parses a `--force` flag and an optional positional profile dir (default:
 * {@link defaultProfileDir}), creates the profile dir if needed, seeds it
 * via {@link seedDemo}, and prints a human-readable summary.
 *
 * @param argv - Command-line arguments (typically `process.argv.slice(2)`).
 * @param print - Sink for status output. Defaults to `console.log`.
 * @returns The {@link SeedDemoResult} from the underlying seed call.
 */
export async function runSeedDemoCli(
  argv: string[],
  print: CliPrinter = (line) => {
    console.log(line);
  },
): Promise<SeedDemoResult> {
  const force = argv.includes("--force");
  const positional = argv.filter((a) => !a.startsWith("--"));
  const profileDir = resolve(positional[0] ?? defaultProfileDir());

  await mkdir(profileDir, { recursive: true });

  const result = await seedDemo({ profileDir, force });

  if (!result.seeded) {
    print(
      `Demo project already exists at ${result.projectDir}. Pass --force to recreate.`,
    );
  } else {
    print(`Seeded demo project at ${result.projectDir}`);
    print(`  scratch repo: ${result.scratchRepoDir}`);
    print(`  pilot:        ${result.pilotId}`);
    print(`  craft:        ${result.callsign}`);
  }

  return result;
}
