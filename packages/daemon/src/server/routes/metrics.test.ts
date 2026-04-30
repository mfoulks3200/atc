import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { CraftStatus } from "@airtrafficcontrol/types";
import { createApp } from "../app.js";
import type { CraftState } from "../../types.js";
import type { AgentRecord } from "../../types.js";

function makeCraftState(
  callsign: string,
  status: CraftStatus = CraftStatus.InFlight,
): CraftState {
  return {
    callsign,
    branch: `branch-${callsign}`,
    cargo: "test cargo",
    status,
    crew: [],
    flightPlan: [],
    blackBox: [],
    intercom: [],
    controls: { mode: "none", holders: [] },
    createdAt: new Date().toISOString(),
  } as unknown as CraftState;
}

function makeAgentRecord(
  id: string,
  status: "running" | "paused" | "suspended" | "terminated" = "running",
): AgentRecord {
  return {
    id,
    adapterType: "stub",
    projectName: "test-project",
    callsign: `craft-${id}`,
    status,
    adapterMeta: {},
  };
}

describe("GET /metrics", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it("returns 200 with Prometheus content-type", async () => {
    app = createApp();
    const response = await app.inject({ method: "GET", url: "/metrics" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.headers["content-type"]).toContain("version=0.0.4");
  });

  it("includes HELP and TYPE headers for all three metric families", async () => {
    app = createApp();
    const response = await app.inject({ method: "GET", url: "/metrics" });
    const body = response.body;

    expect(body).toContain("# HELP atc_merge_queue_depth");
    expect(body).toContain("# TYPE atc_merge_queue_depth gauge");
    expect(body).toContain("# HELP atc_craft_count");
    expect(body).toContain("# TYPE atc_craft_count gauge");
    expect(body).toContain("# HELP atc_agent_count");
    expect(body).toContain("# TYPE atc_agent_count gauge");
  });

  it("ends with a trailing newline (required by Prometheus)", async () => {
    app = createApp();
    const response = await app.inject({ method: "GET", url: "/metrics" });

    expect(response.body.endsWith("\n")).toBe(true);
  });

  describe("atc_merge_queue_depth", () => {
    it("reflects zero depth when no crafts are queued", async () => {
      app = createApp();
      const response = await app.inject({ method: "GET", url: "/metrics" });

      // No queue entries — no project label lines should appear.
      expect(response.body).not.toContain('atc_merge_queue_depth{');
    });

    it("reflects correct depth after crafts are enqueued", async () => {
      app = createApp();
      app.towerStore.enqueue("my-project", "ALPHA01");
      app.towerStore.enqueue("my-project", "BRAVO02");

      const response = await app.inject({ method: "GET", url: "/metrics" });

      expect(response.body).toContain('atc_merge_queue_depth{project="my-project"} 2');
    });

    it("tracks multiple projects independently", async () => {
      app = createApp();
      app.towerStore.enqueue("proj-a", "ALPHA01");
      app.towerStore.enqueue("proj-b", "BRAVO02");
      app.towerStore.enqueue("proj-b", "CHARLIE03");

      const response = await app.inject({ method: "GET", url: "/metrics" });
      const body = response.body;

      expect(body).toContain('atc_merge_queue_depth{project="proj-a"} 1');
      expect(body).toContain('atc_merge_queue_depth{project="proj-b"} 2');
    });

    it("decrements after a craft is dequeued", async () => {
      app = createApp();
      app.towerStore.enqueue("my-project", "ALPHA01");
      app.towerStore.enqueue("my-project", "BRAVO02");
      app.towerStore.dequeue("my-project", "ALPHA01");

      const response = await app.inject({ method: "GET", url: "/metrics" });

      expect(response.body).toContain('atc_merge_queue_depth{project="my-project"} 1');
    });
  });

  describe("atc_craft_count", () => {
    it("emits zero counts for all statuses when no crafts exist", async () => {
      app = createApp();
      const response = await app.inject({ method: "GET", url: "/metrics" });
      const body = response.body;

      for (const status of Object.values(CraftStatus)) {
        expect(body).toContain(`atc_craft_count{status="${status}"} 0`);
      }
    });

    it("counts crafts by status correctly", async () => {
      app = createApp();
      app.craftStore.set("proj", makeCraftState("A", CraftStatus.InFlight));
      app.craftStore.set("proj", makeCraftState("B", CraftStatus.InFlight));
      app.craftStore.set("proj", makeCraftState("C", CraftStatus.Taxiing));

      const response = await app.inject({ method: "GET", url: "/metrics" });
      const body = response.body;

      expect(body).toContain(`atc_craft_count{status="InFlight"} 2`);
      expect(body).toContain(`atc_craft_count{status="Taxiing"} 1`);
    });

    it("counts crafts across multiple projects", async () => {
      app = createApp();
      app.craftStore.set("proj-a", makeCraftState("X", CraftStatus.Landed));
      app.craftStore.set("proj-b", makeCraftState("Y", CraftStatus.Landed));

      const response = await app.inject({ method: "GET", url: "/metrics" });

      expect(response.body).toContain(`atc_craft_count{status="Landed"} 2`);
    });
  });

  describe("atc_agent_count", () => {
    it("emits zero counts for all statuses when no agents exist", async () => {
      app = createApp();
      const response = await app.inject({ method: "GET", url: "/metrics" });
      const body = response.body;

      for (const status of ["running", "paused", "suspended", "terminated"]) {
        expect(body).toContain(`atc_agent_count{status="${status}"} 0`);
      }
    });

    it("counts agents by status correctly", async () => {
      app = createApp();
      app.agentStore.set(makeAgentRecord("a1", "running"));
      app.agentStore.set(makeAgentRecord("a2", "running"));
      app.agentStore.set(makeAgentRecord("a3", "terminated"));

      const response = await app.inject({ method: "GET", url: "/metrics" });
      const body = response.body;

      expect(body).toContain('atc_agent_count{status="running"} 2');
      expect(body).toContain('atc_agent_count{status="terminated"} 1');
      expect(body).toContain('atc_agent_count{status="paused"} 0');
      expect(body).toContain('atc_agent_count{status="suspended"} 0');
    });

    it("tracks terminated agents for crash rate monitoring", async () => {
      app = createApp();
      app.agentStore.set(makeAgentRecord("c1", "terminated"));
      app.agentStore.set(makeAgentRecord("c2", "terminated"));
      app.agentStore.set(makeAgentRecord("c3", "terminated"));

      const response = await app.inject({ method: "GET", url: "/metrics" });

      expect(response.body).toContain('atc_agent_count{status="terminated"} 3');
    });
  });

  describe("label escaping", () => {
    it("escapes double quotes in project names", async () => {
      app = createApp();
      app.towerStore.enqueue('proj"quoted', "ALPHA01");

      const response = await app.inject({ method: "GET", url: "/metrics" });

      expect(response.body).toContain('project="proj\\"quoted"');
    });

    it("escapes backslashes in project names", async () => {
      app = createApp();
      app.towerStore.enqueue("proj\\backslash", "ALPHA01");

      const response = await app.inject({ method: "GET", url: "/metrics" });

      expect(response.body).toContain('project="proj\\\\backslash"');
    });

    it("escapes newlines in project names", async () => {
      app = createApp();
      app.towerStore.enqueue("proj\nnewline", "ALPHA01");

      const response = await app.inject({ method: "GET", url: "/metrics" });

      expect(response.body).toContain('project="proj\\nnewline"');
    });
  });

  describe("unknown status values", () => {
    it("counts a craft with an unrecognised status without throwing", async () => {
      app = createApp();
      app.craftStore.set("proj", {
        ...makeCraftState("Z"),
        status: "ghost" as unknown as CraftStatus,
      });

      const response = await app.inject({ method: "GET", url: "/metrics" });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('atc_craft_count{status="ghost"} 1');
    });

    it("counts an agent with an unrecognised status without throwing", async () => {
      app = createApp();
      app.agentStore.set({
        ...makeAgentRecord("x1"),
        status: "zombie" as unknown as "running",
      });

      const response = await app.inject({ method: "GET", url: "/metrics" });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('atc_agent_count{status="zombie"} 1');
    });
  });
});
