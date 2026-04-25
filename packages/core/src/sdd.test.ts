/**
 * Tests for SDD core functions: generateCallsign and selectCaptain.
 *
 * @see §4.6.2 — Callsign generation algorithm
 * @see §4.6.4 — Pilot auto-selection algorithm
 * @see RULE-SDD-8, RULE-SDD-9, RULE-SDD-10
 */
import { describe, it, expect } from "vitest";
import { generateCallsign, selectCaptain } from "./sdd.js";

// ---------------------------------------------------------------------------
// generateCallsign (§4.6.2)
// ---------------------------------------------------------------------------

describe("generateCallsign", () => {
  it("slugifies the title and appends zero-padded counter", () => {
    const { callsign } = generateCallsign("Add OAuth2 Login", 1, []);
    expect(callsign).toBe("add-oauth2-login-01");
  });

  it("collapses consecutive special characters to single hyphen", () => {
    const { callsign } = generateCallsign("Fix  -- the   bug!", 1, []);
    expect(callsign).toBe("fix-the-bug-01");
  });

  it("returns counter incremented by 1 for the next slug", () => {
    const { nextCounter } = generateCallsign("My Feature", 1, []);
    expect(nextCounter).toBe(2);
  });

  it("skips over existing callsigns and advances counter", () => {
    const existing = ["my-feature-01"];
    const { callsign, nextCounter } = generateCallsign("My Feature", 1, existing);
    expect(callsign).toBe("my-feature-02");
    expect(nextCounter).toBe(3);
  });

  it("pads single-digit counters to two digits (01-09)", () => {
    const { callsign } = generateCallsign("Fix Bug", 9, []);
    expect(callsign).toBe("fix-bug-09");
  });

  it("does not pad three-digit counters", () => {
    const { callsign } = generateCallsign("Fix Bug", 100, []);
    expect(callsign).toBe("fix-bug-100");
  });

  it("handles counter rolling from 99 to 100 without padding", () => {
    const existing = Array.from(
      { length: 99 },
      (_, i) => `my-slug-${String(i + 1).padStart(2, "0")}`,
    );
    const { callsign } = generateCallsign("My Slug", 1, existing);
    expect(callsign).toBe("my-slug-100");
  });

  it("trims leading and trailing hyphens from slug", () => {
    const { callsign } = generateCallsign("  --hello world--  ", 1, []);
    expect(callsign).toBe("hello-world-01");
  });

  it("preserves digits in the title", () => {
    const { callsign } = generateCallsign("Add HTTP2 Support", 5, []);
    expect(callsign).toBe("add-http2-support-05");
  });
});

// ---------------------------------------------------------------------------
// selectCaptain (§4.6.4)
// ---------------------------------------------------------------------------

const makePilot = (id: string, certs: string[], count = 0) => ({
  identifier: id,
  certifications: certs,
  selectionCount: count,
});

describe("selectCaptain", () => {
  it("selects a pilot certified for the category (RULE-SDD-8)", () => {
    const pilots = [makePilot("alice", ["backend"]), makePilot("bob", ["frontend"])];
    const { identifier } = selectCaptain({
      category: "backend",
      pilots,
      activeCrafts: [],
    });
    expect(identifier).toBe("alice");
  });

  it("increments selectionCount on the returned pilot", () => {
    const pilots = [makePilot("alice", ["backend"], 3)];
    const result = selectCaptain({ category: "backend", pilots, activeCrafts: [] });
    expect(result.selectionCount).toBe(4);
  });

  it("throws NO_CERTIFIED_PILOT when no pilot holds the category cert (RULE-SDD-9)", () => {
    const pilots = [makePilot("bob", ["frontend"])];
    expect(() => selectCaptain({ category: "backend", pilots, activeCrafts: [] })).toThrow(
      /NO_CERTIFIED_PILOT/,
    );
  });

  it("error message enumerates category and available pilot certs (RULE-SDD-9)", () => {
    const pilots = [makePilot("bob", ["frontend"]), makePilot("carol", [])];
    expect(() => selectCaptain({ category: "backend", pilots, activeCrafts: [] })).toThrow(
      /backend/,
    );
  });

  it("throws when all pilots are excluded (RULE-SDD-9)", () => {
    const pilots = [makePilot("alice", ["backend"])];
    expect(() =>
      selectCaptain({ category: "backend", pilots, activeCrafts: [], exclude: ["alice"] }),
    ).toThrow(/NO_CERTIFIED_PILOT/);
  });

  it("respects requireCertifications filter (RULE-SDD-8)", () => {
    const pilots = [makePilot("alice", ["backend"]), makePilot("bob", ["backend", "security"])];
    const { identifier } = selectCaptain({
      category: "backend",
      pilots,
      activeCrafts: [],
      requireCertifications: ["security"],
    });
    expect(identifier).toBe("bob");
  });

  it("throws when requireCertifications leaves no candidates (RULE-SDD-9)", () => {
    const pilots = [makePilot("alice", ["backend"])];
    expect(() =>
      selectCaptain({
        category: "backend",
        pilots,
        activeCrafts: [],
        requireCertifications: ["security"],
      }),
    ).toThrow(/NO_CERTIFIED_PILOT/);
  });

  it("picks pilot with lowest selectionCount for workload balance", () => {
    const pilots = [makePilot("alice", ["backend"], 5), makePilot("bob", ["backend"], 2)];
    const { identifier } = selectCaptain({ category: "backend", pilots, activeCrafts: [] });
    expect(identifier).toBe("bob");
  });

  it("prefers pilot not currently captain on an active craft as tiebreak", () => {
    const pilots = [makePilot("alice", ["backend"], 1), makePilot("bob", ["backend"], 1)];
    const activeCrafts = [{ captain: "alice" }];
    const { identifier } = selectCaptain({
      category: "backend",
      pilots,
      activeCrafts,
    });
    expect(identifier).toBe("bob");
  });

  it("excludes pilots listed in spec.pilots.exclude", () => {
    const pilots = [makePilot("alice", ["backend"]), makePilot("bob", ["backend"])];
    const { identifier } = selectCaptain({
      category: "backend",
      pilots,
      activeCrafts: [],
      exclude: ["alice"],
    });
    expect(identifier).toBe("bob");
  });

  it("does not mutate the input pilots array selectionCount", () => {
    const pilots = [makePilot("alice", ["backend"], 0)];
    selectCaptain({ category: "backend", pilots, activeCrafts: [] });
    expect(pilots[0].selectionCount).toBe(0);
  });
});
