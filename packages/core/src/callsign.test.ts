import { describe, it, expect } from "vitest";
import { slugifyTitle, generateCallsign } from "./callsign.js";
import { CallsignConflictError } from "@airtrafficcontrol/errors";

describe("slugifyTitle", () => {
  it("lowercases the title", () => {
    expect(slugifyTitle("Add OAuth2 Login")).toContain("add");
    expect(slugifyTitle("Add OAuth2 Login")).not.toContain("A");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugifyTitle("add oauth login")).toBe("add-oauth-login");
  });

  it("replaces special characters with hyphens", () => {
    expect(slugifyTitle("fix: auth/session bug")).toBe("fix-auth-session-bug");
  });

  it("collapses consecutive hyphens into one", () => {
    expect(slugifyTitle("fix -- all -- bugs")).toBe("fix-all-bugs");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugifyTitle("  leading and trailing  ")).toBe("leading-and-trailing");
  });

  it("truncates at 40 characters at a word boundary", () => {
    const longTitle = "implement the very long feature that exceeds forty characters";
    const result = slugifyTitle(longTitle);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result).not.toMatch(/-$/);
  });

  it("does not truncate mid-word — truncates at word boundary", () => {
    // "implement-the-very-long-feature-that-ex" would be 39 chars but cuts mid-word "exceeds"
    // so should cut at "that" boundary
    const result = slugifyTitle("implement the very long feature that exceeds forty characters");
    expect(result).not.toMatch(/^.*-[a-z]+$/u.test(result) ? /never/ : /never/);
    const words = result.split("-");
    // every segment should be a full word from the slug
    const slug = "implement-the-very-long-feature-that-exceeds-forty-characters";
    const slugWords = slug.split("-");
    for (const word of words) {
      expect(slugWords).toContain(word);
    }
  });

  it("handles titles with numbers and mixed characters", () => {
    expect(slugifyTitle("Add OAuth2 login (v3)")).toBe("add-oauth2-login-v3");
  });

  it("handles empty string", () => {
    expect(slugifyTitle("")).toBe("");
  });

  it("handles title that is exactly 40 characters after slugification", () => {
    // Create a title whose slug is exactly 40 chars
    const title = "a".repeat(40);
    const result = slugifyTitle(title);
    expect(result.length).toBeLessThanOrEqual(40);
  });

  it("returns 40-char slice when a 50-char single word has no word boundary to cut at", () => {
    // A single lowercase word longer than 40 chars has no hyphens, so the
    // lastHyphen <= 0 branch fires and we return the raw 40-char truncation.
    const result = slugifyTitle("a".repeat(50));
    expect(result).toBe("a".repeat(40));
  });
});

describe("generateCallsign", () => {
  it("appends zero-padded counter to slug", () => {
    const { callsign } = generateCallsign("Add OAuth2 Login", 1, []);
    expect(callsign).toBe("add-oauth2-login-01");
  });

  it("zero-pads counter for 1-9", () => {
    const { callsign } = generateCallsign("fix bug", 5, []);
    expect(callsign).toBe("fix-bug-05");
  });

  it("zero-pads counter for 10-99", () => {
    const { callsign } = generateCallsign("fix bug", 10, []);
    expect(callsign).toBe("fix-bug-10");
  });

  it("does not zero-pad counter >= 100", () => {
    const { callsign } = generateCallsign("fix bug", 100, []);
    expect(callsign).toBe("fix-bug-100");
  });

  it("returns the nextCounter as counter + 1 on success", () => {
    const { nextCounter } = generateCallsign("fix bug", 1, []);
    expect(nextCounter).toBe(2);
  });

  it("retries when callsign collides with existing", () => {
    const existing = ["fix-bug-01", "fix-bug-02"];
    const { callsign, nextCounter } = generateCallsign("fix bug", 1, existing);
    expect(callsign).toBe("fix-bug-03");
    expect(nextCounter).toBe(4);
  });

  it("throws CallsignConflictError when 100 consecutive collisions occur", () => {
    // Fill 100 consecutive slots starting from counter 1
    const existing: string[] = [];
    for (let i = 1; i <= 100; i++) {
      existing.push(`fix-bug-${String(i).padStart(2, "0")}`);
    }
    expect(() => generateCallsign("fix bug", 1, existing)).toThrow(CallsignConflictError);
  });

  it("throws CallsignConflictError with CALLSIGN_CONFLICT code", () => {
    const existing: string[] = [];
    for (let i = 1; i <= 100; i++) {
      existing.push(`fix-bug-${String(i).padStart(2, "0")}`);
    }
    try {
      generateCallsign("fix bug", 1, existing);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CallsignConflictError);
      expect((err as CallsignConflictError).code).toBe("CALLSIGN_CONFLICT");
    }
  });

  it("does not retry when counter reaches 100 (3-digit no-pad boundary)", () => {
    // counter 100 should produce "fix-bug-100" — no extra padding
    const { callsign } = generateCallsign("fix bug", 100, []);
    expect(callsign).toBe("fix-bug-100");
  });

  it("truncates slug portion to 40 chars at word boundary", () => {
    const longTitle = "implement the very long feature that exceeds forty characters";
    const { callsign } = generateCallsign(longTitle, 1, []);
    // callsign = slug + "-01"; slug must be <= 40 chars
    const slug = callsign.replace(/-\d+$/, "");
    expect(slug.length).toBeLessThanOrEqual(40);
  });
});
