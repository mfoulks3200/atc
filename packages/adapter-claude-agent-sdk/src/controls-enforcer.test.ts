import { describe, it, expect, vi } from "vitest";
import {
  normalizeFilePath,
  isFileInPilotArea,
  decideForFileModification,
  decideForBash,
  createControlsCanUseTool,
  type ControlsSnapshot,
} from "./controls-enforcer.js";

const WORKTREE = "/tmp/worktree";

describe("normalizeFilePath", () => {
  it("keeps relative paths relative", () => {
    expect(normalizeFilePath("src/api/foo.ts", WORKTREE)).toBe("src/api/foo.ts");
  });

  it("strips ./ from relative paths", () => {
    expect(normalizeFilePath("./src/api/foo.ts", WORKTREE)).toBe("src/api/foo.ts");
  });

  it("converts absolute paths inside the worktree to relative", () => {
    expect(normalizeFilePath(`${WORKTREE}/src/api/foo.ts`, WORKTREE)).toBe("src/api/foo.ts");
  });

  it("keeps absolute paths outside the worktree as-is", () => {
    expect(normalizeFilePath("/etc/passwd", WORKTREE)).toBe("/etc/passwd");
  });
});

describe("isFileInPilotArea", () => {
  const shared: ControlsSnapshot = {
    mode: "shared",
    sharedAreas: [
      { pilotId: "captain-1", area: "src/api" },
      { pilotId: "fo-1", area: "src/web" },
    ],
  };

  it("returns true when the path starts with the pilot's assigned area", () => {
    expect(isFileInPilotArea("src/api/foo.ts", "captain-1", shared)).toBe(true);
  });

  it("returns false when the path is outside the pilot's area", () => {
    expect(isFileInPilotArea("src/web/page.tsx", "captain-1", shared)).toBe(false);
  });

  it("does not treat area as a loose prefix (src/api does not match src/api-v2)", () => {
    expect(isFileInPilotArea("src/api-v2/foo.ts", "captain-1", shared)).toBe(false);
  });

  it("matches exactly on the area path itself", () => {
    expect(isFileInPilotArea("src/api", "captain-1", shared)).toBe(true);
  });

  it("returns false for pilots not listed in shared areas", () => {
    expect(isFileInPilotArea("src/api/foo.ts", "stranger", shared)).toBe(false);
  });

  it("returns false in exclusive mode", () => {
    const exclusive: ControlsSnapshot = { mode: "exclusive", holder: "captain-1" };
    expect(isFileInPilotArea("src/api/foo.ts", "captain-1", exclusive)).toBe(false);
  });
});

describe("decideForFileModification — exclusive mode", () => {
  const exclusive: ControlsSnapshot = { mode: "exclusive", holder: "captain-1" };

  it("allows the exclusive holder to edit any file", () => {
    const decision = decideForFileModification(exclusive, "captain-1", WORKTREE, "src/api/foo.ts");
    expect(decision.behavior).toBe("allow");
  });

  it("denies non-holders and cites RULE-CTRL-3", () => {
    const decision = decideForFileModification(exclusive, "fo-1", WORKTREE, "src/api/foo.ts");
    expect(decision.behavior).toBe("deny");
    if (decision.behavior === "deny") {
      expect(decision.message).toContain("RULE-CTRL-3");
      expect(decision.message).toContain("captain-1");
      expect(decision.message).toContain("atc_controls_transfer");
    }
  });
});

describe("decideForFileModification — shared mode", () => {
  const shared: ControlsSnapshot = {
    mode: "shared",
    sharedAreas: [
      { pilotId: "captain-1", area: "src/api" },
      { pilotId: "fo-1", area: "src/web" },
    ],
  };

  it("allows edits within the pilot's assigned area", () => {
    const decision = decideForFileModification(shared, "fo-1", WORKTREE, "src/web/page.tsx");
    expect(decision.behavior).toBe("allow");
  });

  it("denies edits outside the pilot's area", () => {
    const decision = decideForFileModification(shared, "fo-1", WORKTREE, "src/api/foo.ts");
    expect(decision.behavior).toBe("deny");
    if (decision.behavior === "deny") {
      expect(decision.message).toContain("RULE-CTRL-3");
      expect(decision.message).toContain("src/web"); // their assigned area
    }
  });

  it("denies a pilot with no assigned area", () => {
    const decision = decideForFileModification(shared, "stranger", WORKTREE, "src/web/foo.tsx");
    expect(decision.behavior).toBe("deny");
    if (decision.behavior === "deny") {
      expect(decision.message).toContain("no areas assigned");
    }
  });

  it("handles absolute paths inside the worktree", () => {
    const decision = decideForFileModification(
      shared,
      "fo-1",
      WORKTREE,
      `${WORKTREE}/src/web/page.tsx`,
    );
    expect(decision.behavior).toBe("allow");
  });
});

describe("decideForBash", () => {
  it("allows the exclusive holder", () => {
    const exclusive: ControlsSnapshot = { mode: "exclusive", holder: "captain-1" };
    expect(decideForBash(exclusive, "captain-1").behavior).toBe("allow");
  });

  it("denies non-holders in exclusive mode", () => {
    const exclusive: ControlsSnapshot = { mode: "exclusive", holder: "captain-1" };
    const d = decideForBash(exclusive, "fo-1");
    expect(d.behavior).toBe("deny");
    if (d.behavior === "deny") expect(d.message).toContain("RULE-CTRL-3");
  });

  it("allows any pilot who has at least one shared area", () => {
    const shared: ControlsSnapshot = {
      mode: "shared",
      sharedAreas: [{ pilotId: "fo-1", area: "src" }],
    };
    expect(decideForBash(shared, "fo-1").behavior).toBe("allow");
  });

  it("denies pilots with no shared area", () => {
    const shared: ControlsSnapshot = {
      mode: "shared",
      sharedAreas: [{ pilotId: "fo-1", area: "src" }],
    };
    expect(decideForBash(shared, "stranger").behavior).toBe("deny");
  });
});

describe("createControlsCanUseTool", () => {
  function mockFetch(snapshot: ControlsSnapshot): typeof fetch {
    // Each call yields a fresh Response — Response bodies can only be
    // consumed once, so reusing a single instance across calls throws.
    return vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify(snapshot), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as unknown as typeof fetch;
  }

  it("fetches controls from the daemon and returns an allow for holders", async () => {
    const fetchSpy = mockFetch({ mode: "exclusive", holder: "captain-1" });
    const canUse = createControlsCanUseTool({
      daemonUrl: "http://localhost:7700",
      projectName: "proj",
      callsign: "ALPHA",
      pilotId: "captain-1",
      seat: "captain",
      worktreePath: WORKTREE,
      fetch: fetchSpy,
    });
    const input = { file_path: "src/api/foo.ts", old_string: "a", new_string: "b" };
    const result = await canUse("Edit", input);
    expect(result.behavior).toBe("allow");
    if (result.behavior === "allow") {
      // The SDK passes updatedInput through to the tool — echo the original.
      expect(result.updatedInput).toEqual(input);
    }
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:7700/api/v1/projects/proj/crafts/ALPHA/controls",
    );
  });

  it("denies non-holders trying to Edit", async () => {
    const canUse = createControlsCanUseTool({
      daemonUrl: "http://localhost:7700",
      projectName: "proj",
      callsign: "ALPHA",
      pilotId: "fo-1",
      seat: "firstOfficer",
      worktreePath: WORKTREE,
      fetch: mockFetch({ mode: "exclusive", holder: "captain-1" }),
    });
    const result = await canUse("Edit", { file_path: "src/api/foo.ts" });
    expect(result.behavior).toBe("deny");
  });

  it("always allows MCP tools (they have their own auth)", async () => {
    const canUse = createControlsCanUseTool({
      daemonUrl: "http://localhost:7700",
      projectName: "proj",
      callsign: "ALPHA",
      pilotId: "fo-1",
      seat: "firstOfficer",
      worktreePath: WORKTREE,
      fetch: mockFetch({ mode: "exclusive", holder: "captain-1" }),
    });
    const result = await canUse("mcp__atc-intercom__intercom_send", { content: "hi" });
    expect(result.behavior).toBe("allow");
  });

  it("always allows read-only tools (Read, Glob, Grep)", async () => {
    const canUse = createControlsCanUseTool({
      daemonUrl: "http://localhost:7700",
      projectName: "proj",
      callsign: "ALPHA",
      pilotId: "fo-1",
      seat: "firstOfficer",
      worktreePath: WORKTREE,
      fetch: mockFetch({ mode: "exclusive", holder: "captain-1" }),
    });
    for (const toolName of ["Read", "Glob", "Grep", "LS"]) {
      const result = await canUse(toolName, { file_path: "/anywhere" });
      expect(result.behavior).toBe("allow");
    }
  });

  it("gates Bash on the pilot holding any controls", async () => {
    const canUse = createControlsCanUseTool({
      daemonUrl: "http://localhost:7700",
      projectName: "proj",
      callsign: "ALPHA",
      pilotId: "fo-1",
      seat: "firstOfficer",
      worktreePath: WORKTREE,
      fetch: mockFetch({ mode: "exclusive", holder: "captain-1" }),
    });
    const result = await canUse("Bash", { command: "ls" });
    expect(result.behavior).toBe("deny");
  });

  it("denies file-modifying tools without a file_path", async () => {
    const canUse = createControlsCanUseTool({
      daemonUrl: "http://localhost:7700",
      projectName: "proj",
      callsign: "ALPHA",
      pilotId: "captain-1",
      seat: "captain",
      worktreePath: WORKTREE,
      fetch: mockFetch({ mode: "exclusive", holder: "captain-1" }),
    });
    const result = await canUse("Write", {});
    expect(result.behavior).toBe("deny");
    if (result.behavior === "deny") {
      expect(result.message).toContain("no file_path");
    }
  });
});
