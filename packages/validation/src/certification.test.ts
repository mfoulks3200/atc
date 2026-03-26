import { describe, it, expect } from "vitest";
import type { Pilot } from "@atc/types";
import { isPilotCertified } from "./certification.js";

describe("isPilotCertified", () => {
  const certifiedPilot: Pilot = {
    identifier: "pilot-1",
    certifications: ["Backend Engineering", "Frontend Engineering"],
  };

  const uncertifiedPilot: Pilot = {
    identifier: "pilot-2",
    certifications: [],
  };

  const singleCertPilot: Pilot = {
    identifier: "pilot-3",
    certifications: ["Infrastructure"],
  };

  it("returns true when pilot is certified for the category", () => {
    expect(isPilotCertified(certifiedPilot, "Backend Engineering")).toBe(true);
  });

  it("returns true for any matching certification in the list", () => {
    expect(isPilotCertified(certifiedPilot, "Frontend Engineering")).toBe(true);
  });

  it("returns false when pilot is not certified for the category", () => {
    expect(isPilotCertified(certifiedPilot, "Infrastructure")).toBe(false);
  });

  it("returns false when pilot has no certifications", () => {
    expect(isPilotCertified(uncertifiedPilot, "Backend Engineering")).toBe(false);
  });

  it("returns false for empty category string", () => {
    expect(isPilotCertified(certifiedPilot, "")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(isPilotCertified(singleCertPilot, "infrastructure")).toBe(false);
    expect(isPilotCertified(singleCertPilot, "Infrastructure")).toBe(true);
  });
});
