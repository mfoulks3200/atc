/**
 * Tests for POST /api/v1/projects/:name/crafts/from-spec
 *
 * Exercises the 12-step SDD creation procedure, dry-run mode, autoLaunch
 * guards, YAML body parsing, and error responses.
 *
 * @see RULE-SDD-1 through RULE-SDD-17
 * @see §4.6.1 Creation Procedure
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { CraftStore } from "../../state/craft-store.js";
import { PilotStore } from "../../state/pilot-store.js";
import { TfrStore } from "../../state/tfr-store.js";
import { ChannelRegistry } from "../websocket/channels.js";
import { createProjectConfigStore } from "../../config/project-store.js";
import type { LayeredConfigStore } from "../../config/layered-store.js";
import type { ProjectMetadataConfig } from "../../config/schema.js";
import type { PilotRecord } from "../../types.js";

vi.mock("../../git/worktree.js", () => ({
  createWorktree: vi.fn().mockResolvedValue(undefined),
  removeWorktree: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../git/merge.js", () => ({
  getDefaultBranch: vi.fn().mockResolvedValue("main"),
}));

const PROJECT = "test-proj";

const VALID_SPEC_JSON = {
  title: "Add OAuth2 Login",
  cargo: "Implement the OAuth2 login flow for GitHub and Google.",
  category: "backend",
  vectors: [
    { name: "Design", criteria: ["RFC document approved"] },
    { name: "Implement", criteria: ["All tests pass", "Code reviewed"] },
  ],
  priority: "high",
};

const PILOT_CAPTAIN: PilotRecord = {
  identifier: "pilot-captain",
  certifications: ["backend"],
  mcpServers: {},
};

const PILOT_FO: PilotRecord = {
  identifier: "pilot-fo",
  certifications: ["backend"],
  mcpServers: {},
};

async function bootApp(
  configOverrides: Partial<ProjectMetadataConfig> = {},
  pilots: PilotRecord[] = [PILOT_CAPTAIN, PILOT_FO],
) {
  const profileDir = await mkdtemp(join(tmpdir(), "atc-from-spec-"));
  const projectDir = join(profileDir, "projects", PROJECT);
  await mkdir(projectDir, { recursive: true });

  const channels = new ChannelRegistry();
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };

  const store = createProjectConfigStore(
    PROJECT,
    projectDir,
    channels.publish.bind(channels),
    logger,
  );
  await store.load();

  if (Object.keys(configOverrides).length > 0) {
    await store.patch(configOverrides);
  }

  const projectConfigStores = new Map<string, LayeredConfigStore<ProjectMetadataConfig>>();
  projectConfigStores.set(PROJECT, store);

  const stateDir = join(profileDir, "state");
  await mkdir(stateDir, { recursive: true });

  const craftStore = new CraftStore(stateDir);
  const pilotStore = new PilotStore(stateDir);
  const tfrStore = new TfrStore(stateDir);

  for (const pilot of pilots) {
    pilotStore.set(PROJECT, pilot);
  }

  const app = createApp({
    profileDir,
    craftStore,
    pilotStore,
    tfrStore,
    channelRegistry: channels,
    projectConfigStores,
  });
  await app.ready();

  return { app, craftStore, pilotStore, store, profileDir };
}

describe("POST /api/v1/projects/:name/crafts/from-spec", () => {
  let app: FastifyInstance;
  let profileDir: string;

  afterEach(async () => {
    if (app) await app.close();
    if (profileDir) await rm(profileDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it("creates a craft in Taxiing status and returns 201 (JSON body)", async () => {
    const boot = await bootApp({ categories: ["backend"] });
    app = boot.app;
    profileDir = boot.profileDir;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: VALID_SPEC_JSON,
      headers: { "content-type": "application/json" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe("Taxiing");
    expect(body.cargo).toBe(VALID_SPEC_JSON.cargo);
    expect(body.category).toBe("backend");
    expect(body.captain).toBe(PILOT_CAPTAIN.identifier);
    expect(body.flightPlan).toHaveLength(2);
    expect(body.callsign).toMatch(/^add-oauth2-login-/);
  });

  it("creates a craft with YAML body (application/yaml)", async () => {
    const boot = await bootApp({ categories: ["backend"] });
    app = boot.app;
    profileDir = boot.profileDir;

    const yaml = [
      "title: Add OAuth2 Login",
      "cargo: Implement the OAuth2 login flow.",
      "category: backend",
      "vectors:",
      "  - name: Design",
      "    criteria:",
      "      - RFC document approved",
    ].join("\n");

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: yaml,
      headers: { "content-type": "application/yaml" },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("Taxiing");
  });

  it("creates a craft with YAML body (application/x-yaml)", async () => {
    const boot = await bootApp({ categories: ["backend"] });
    app = boot.app;
    profileDir = boot.profileDir;

    const yaml = [
      "title: Add OAuth2 Login",
      "cargo: Implement the OAuth2 login flow.",
      "category: backend",
      "vectors:",
      "  - name: Design",
      "    criteria:",
      "      - RFC document approved",
    ].join("\n");

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: yaml,
      headers: { "content-type": "application/x-yaml" },
    });

    expect(res.statusCode).toBe(201);
  });

  it("generates unique callsigns and increments the counter (RULE-SDD-5, §4.6.2)", async () => {
    const boot = await bootApp({ categories: ["backend"] });
    app = boot.app;
    profileDir = boot.profileDir;

    const res1 = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: VALID_SPEC_JSON,
    });
    const res2 = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: VALID_SPEC_JSON,
    });

    expect(res1.statusCode).toBe(201);
    expect(res2.statusCode).toBe(201);
    expect(res1.json().callsign).not.toBe(res2.json().callsign);
  });

  it("persists a SpecCreated black box entry (RULE-SDD-16)", async () => {
    const boot = await bootApp({ categories: ["backend"] });
    app = boot.app;
    profileDir = boot.profileDir;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: VALID_SPEC_JSON,
    });

    const craft = res.json();
    const sddEntry = craft.blackBox.find((e: { type: string }) => e.type === "SpecCreated");
    expect(sddEntry).toBeDefined();
    expect(sddEntry.content).toContain("Add OAuth2 Login");
  });

  it("records submission source 'rest' in SpecCreated bbox entry (RULE-SDD-16)", async () => {
    const boot = await bootApp({ categories: ["backend"] });
    app = boot.app;
    profileDir = boot.profileDir;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: VALID_SPEC_JSON,
    });

    const craft = res.json();
    const sddEntry = craft.blackBox.find((e: { type: string }) => e.type === "SpecCreated");
    expect(sddEntry.content).toContain("rest");
  });

  it("uses callsignOverride when provided and unique (RULE-SDD-5)", async () => {
    const boot = await bootApp({ categories: ["backend"] });
    app = boot.app;
    profileDir = boot.profileDir;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: { ...VALID_SPEC_JSON, callsignOverride: "my-custom-callsign" },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().callsign).toBe("my-custom-callsign");
  });

  // -------------------------------------------------------------------------
  // Dry-run (RULE-SDD-15)
  // -------------------------------------------------------------------------

  it("dry-run returns computed craft without persisting (RULE-SDD-15)", async () => {
    const boot = await bootApp({ categories: ["backend"] });
    app = boot.app;
    profileDir = boot.profileDir;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec?dryRun=true`,
      payload: VALID_SPEC_JSON,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.callsign).toMatch(/^add-oauth2-login-/);
    expect(body.status).toBe("Taxiing");

    // Nothing persisted
    expect(boot.craftStore.listForProject(PROJECT)).toHaveLength(0);
  });

  it("dry-run does not increment callsign counter (RULE-SDD-15)", async () => {
    const boot = await bootApp({ categories: ["backend"] });
    app = boot.app;
    profileDir = boot.profileDir;

    const counterBefore = boot.store.get().callsignCounter;

    await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec?dryRun=true`,
      payload: VALID_SPEC_JSON,
    });

    const counterAfter = boot.store.get().callsignCounter;
    expect(counterAfter).toBe(counterBefore);
  });

  // -------------------------------------------------------------------------
  // Validation errors
  // -------------------------------------------------------------------------

  it("rejects missing title with 422 SPEC_VALIDATION_ERROR (RULE-SDD-1)", async () => {
    const boot = await bootApp({ categories: ["backend"] });
    app = boot.app;
    profileDir = boot.profileDir;

    const { title: _t, ...noTitle } = VALID_SPEC_JSON;
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: noTitle,
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("SPEC_VALIDATION_ERROR");
  });

  it("rejects empty vectors array with 422 SPEC_VALIDATION_ERROR (RULE-SDD-4)", async () => {
    const boot = await bootApp({ categories: ["backend"] });
    app = boot.app;
    profileDir = boot.profileDir;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: { ...VALID_SPEC_JSON, vectors: [] },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("SPEC_VALIDATION_ERROR");
  });

  it("rejects vector with no criteria with 422 SPEC_VALIDATION_ERROR (RULE-SDD-2)", async () => {
    const boot = await bootApp({ categories: ["backend"] });
    app = boot.app;
    profileDir = boot.profileDir;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: { ...VALID_SPEC_JSON, vectors: [{ name: "step", criteria: [] }] },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("SPEC_VALIDATION_ERROR");
  });

  it("rejects unknown category with 422 UNKNOWN_CATEGORY (RULE-SDD-3)", async () => {
    const boot = await bootApp({ categories: ["backend"] });
    app = boot.app;
    profileDir = boot.profileDir;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: { ...VALID_SPEC_JSON, category: "unknown-category" },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("UNKNOWN_CATEGORY");
  });

  it("rejects when no certified pilot is available with 422 NO_CERTIFIED_PILOT (RULE-SDD-9)", async () => {
    const boot = await bootApp({ categories: ["frontend"] }, [
      { identifier: "pilot-1", certifications: ["backend"], mcpServers: {} },
    ]);
    app = boot.app;
    profileDir = boot.profileDir;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: { ...VALID_SPEC_JSON, category: "frontend" },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("NO_CERTIFIED_PILOT");
  });

  it("rejects explicit captain with wrong certification with 422 PILOT_NOT_CERTIFIED (RULE-SDD-6)", async () => {
    const boot = await bootApp({ categories: ["backend"] });
    app = boot.app;
    profileDir = boot.profileDir;

    boot.pilotStore.set(PROJECT, {
      identifier: "no-cert-pilot",
      certifications: [],
      mcpServers: {},
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: { ...VALID_SPEC_JSON, pilots: { captain: "no-cert-pilot" } },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("PILOT_NOT_CERTIFIED");
  });

  it("rejects same pilot as captain and FO with 422 PILOT_ROLE_CONFLICT (RULE-SDD-10)", async () => {
    const boot = await bootApp({ categories: ["backend"] });
    app = boot.app;
    profileDir = boot.profileDir;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: {
        ...VALID_SPEC_JSON,
        pilots: {
          captain: PILOT_CAPTAIN.identifier,
          firstOfficers: [PILOT_CAPTAIN.identifier],
        },
      },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("PILOT_ROLE_CONFLICT");
  });

  it("rejects duplicate callsign override with 409 CALLSIGN_CONFLICT (RULE-SDD-5)", async () => {
    const boot = await bootApp({ categories: ["backend"] });
    app = boot.app;
    profileDir = boot.profileDir;

    await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: { ...VALID_SPEC_JSON, callsignOverride: "my-fixed-callsign" },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: { ...VALID_SPEC_JSON, callsignOverride: "my-fixed-callsign" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("CALLSIGN_CONFLICT");
  });

  it("returns 404 for unknown project", async () => {
    const boot = await bootApp({ categories: ["backend"] });
    app = boot.app;
    profileDir = boot.profileDir;

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/projects/nonexistent/crafts/from-spec",
      payload: VALID_SPEC_JSON,
    });

    expect(res.statusCode).toBe(404);
  });

  // -------------------------------------------------------------------------
  // AutoLaunch guards (RULE-SDD-11 through RULE-SDD-14)
  // -------------------------------------------------------------------------

  it("suppresses autoLaunch when project allowAutoLaunch is false (RULE-SDD-11)", async () => {
    const boot = await bootApp({ categories: ["backend"], allowAutoLaunch: false });
    app = boot.app;
    profileDir = boot.profileDir;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: { ...VALID_SPEC_JSON, autoLaunch: true },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("Taxiing");
  });

  it("suppresses autoLaunch when active global TFR exists and sets holdingPattern (RULE-SDD-12)", async () => {
    const boot = await bootApp({ categories: ["backend"], allowAutoLaunch: true });
    app = boot.app;
    profileDir = boot.profileDir;

    await app.inject({
      method: "POST",
      url: "/api/v1/tfrs",
      payload: {
        scope: "global",
        target: null,
        mode: "graceful",
        reason: "freeze",
        issuedBy: "user",
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: { ...VALID_SPEC_JSON, autoLaunch: true },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("Taxiing");
    expect(res.json().holdingPattern).toBe(true);
  });

  it("suppresses autoLaunch when active project-scoped TFR exists (RULE-SDD-12)", async () => {
    const boot = await bootApp({ categories: ["backend"], allowAutoLaunch: true });
    app = boot.app;
    profileDir = boot.profileDir;

    await app.inject({
      method: "POST",
      url: "/api/v1/tfrs",
      payload: {
        scope: "project",
        target: PROJECT,
        mode: "graceful",
        reason: "project freeze",
        issuedBy: "user",
        projectName: PROJECT,
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: { ...VALID_SPEC_JSON, autoLaunch: true },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("Taxiing");
    expect(res.json().holdingPattern).toBe(true);
  });

  it("records autoLaunch suppression reason in SpecCreated bbox entry (RULE-SDD-16)", async () => {
    const boot = await bootApp({ categories: ["backend"], allowAutoLaunch: false });
    app = boot.app;
    profileDir = boot.profileDir;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: { ...VALID_SPEC_JSON, autoLaunch: true },
    });

    const craft = res.json();
    const sddEntry = craft.blackBox.find((e: { type: string }) => e.type === "SpecCreated");
    expect(sddEntry).toBeDefined();
    expect(sddEntry.content).toMatch(/suppressed|allowAutoLaunch/i);
  });

  // -------------------------------------------------------------------------
  // RULE-SDD-14: agent-submitted specs cannot autoLaunch
  // -------------------------------------------------------------------------

  it("suppresses autoLaunch when submitted by an agent (x-atc-agent-id header, RULE-SDD-14)", async () => {
    const boot = await bootApp({ categories: ["backend"], allowAutoLaunch: true });
    app = boot.app;
    profileDir = boot.profileDir;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      headers: { "x-atc-agent-id": "agent-abc123" },
      payload: { ...VALID_SPEC_JSON, autoLaunch: true },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("Taxiing");
  });

  it("records agent suppression reason in SpecCreated bbox entry (RULE-SDD-14, RULE-SDD-16)", async () => {
    const boot = await bootApp({ categories: ["backend"], allowAutoLaunch: true });
    app = boot.app;
    profileDir = boot.profileDir;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      headers: { "x-atc-agent-id": "agent-abc123" },
      payload: { ...VALID_SPEC_JSON, autoLaunch: true },
    });

    const craft = res.json();
    const sddEntry = craft.blackBox.find((e: { type: string }) => e.type === "SpecCreated");
    expect(sddEntry).toBeDefined();
    expect(sddEntry.content).toMatch(/agent|RULE-SDD-14/i);
  });

  it("allows autoLaunch when submitted without agent header and all other guards pass (RULE-SDD-14)", async () => {
    const boot = await bootApp({ categories: ["backend"], allowAutoLaunch: true });
    app = boot.app;
    profileDir = boot.profileDir;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: { ...VALID_SPEC_JSON, autoLaunch: true },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("InFlight");
  });

  // -------------------------------------------------------------------------
  // RULE-SDD-13: spec:autolaunch scope required for autoLaunch
  // -------------------------------------------------------------------------

  it("suppresses autoLaunch when API key lacks spec:autolaunch scope (RULE-SDD-13)", async () => {
    const boot = await bootApp({ categories: ["backend"], allowAutoLaunch: true });
    app = boot.app;
    profileDir = boot.profileDir;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      headers: { "x-atc-scope": "spec:submit" },
      payload: { ...VALID_SPEC_JSON, autoLaunch: true },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("Taxiing");
  });

  it("allows autoLaunch when API key carries spec:autolaunch scope (RULE-SDD-13)", async () => {
    const boot = await bootApp({ categories: ["backend"], allowAutoLaunch: true });
    app = boot.app;
    profileDir = boot.profileDir;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      headers: { "x-atc-scope": "spec:autolaunch spec:submit" },
      payload: { ...VALID_SPEC_JSON, autoLaunch: true },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("InFlight");
  });

  // -------------------------------------------------------------------------
  // RULE-VCMD-9: spec:command scope check
  // -------------------------------------------------------------------------

  it("rejects spec with command vectors when only spec:submit scope is present (RULE-VCMD-9)", async () => {
    const boot = await bootApp({ categories: ["backend"] });
    app = boot.app;
    profileDir = boot.profileDir;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      headers: { "x-atc-scope": "spec:submit" },
      payload: {
        ...VALID_SPEC_JSON,
        vectors: [{ name: "Run tests", command: { run: "pnpm test" } }],
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("INSUFFICIENT_SCOPE");
  });

  it("allows spec with command vectors when spec:command scope is present (RULE-VCMD-9)", async () => {
    const boot = await bootApp({ categories: ["backend"] });
    app = boot.app;
    profileDir = boot.profileDir;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      headers: { "x-atc-scope": "spec:submit spec:command" },
      payload: {
        ...VALID_SPEC_JSON,
        vectors: [{ name: "Run tests", command: { run: "pnpm test" } }],
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().callsign).toBeTruthy();
  });

  it("allows spec without command vectors regardless of scope (RULE-VCMD-9)", async () => {
    const boot = await bootApp({ categories: ["backend"] });
    app = boot.app;
    profileDir = boot.profileDir;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      headers: { "x-atc-scope": "spec:submit" },
      payload: VALID_SPEC_JSON,
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().callsign).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Compensating rollback (§4.6.1 step 9)
  // -------------------------------------------------------------------------

  it("calls removeWorktree when craft persistence fails (compensating rollback)", async () => {
    const { createWorktree: mockCreate, removeWorktree: mockRemove } =
      await import("../../git/worktree.js");
    const boot = await bootApp({ categories: ["backend"] });
    app = boot.app;
    profileDir = boot.profileDir;

    // Make createWorktree succeed and removeWorktree trackable
    vi.mocked(mockCreate).mockResolvedValueOnce(undefined);
    vi.mocked(mockRemove).mockResolvedValueOnce(undefined);

    // Force craftStore.set to throw on the first real call (step 9)
    const originalSet = boot.craftStore.set.bind(boot.craftStore);
    let setCallCount = 0;
    vi.spyOn(boot.craftStore, "set").mockImplementation((...args) => {
      setCallCount++;
      if (setCallCount === 1) throw new Error("disk full");
      return originalSet(...args);
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/from-spec`,
      payload: VALID_SPEC_JSON,
    });

    expect(res.statusCode).toBe(500);
    expect(vi.mocked(mockRemove)).toHaveBeenCalled();
  });
});
