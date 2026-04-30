import { describe, it, expect } from "vitest";
import { SeatType, VectorType } from "@airtrafficcontrol/types";
import type { Vector } from "@airtrafficcontrol/types";
import { VectorError } from "@airtrafficcontrol/errors";
import {
  isAdversarialReviewVector,
  validateAdversarialReviewerIdentity,
  validateAdversarialReviewerSeat,
} from "./vector.js";

const makeVector = (type?: VectorType): Vector => ({
  name: "test-vector",
  acceptanceCriteria: "All tests pass",
  status: "Pending" as any,
  type,
});

describe("isAdversarialReviewVector", () => {
  it("returns true for adversarial_review type (RULE-VEC-6)", () => {
    const vector = makeVector(VectorType.AdversarialReview);
    expect(isAdversarialReviewVector(vector)).toBe(true);
  });

  it("returns false for standard type (RULE-VEC-6)", () => {
    const vector = makeVector(VectorType.Standard);
    expect(isAdversarialReviewVector(vector)).toBe(false);
  });

  it("returns false when type is omitted (RULE-VEC-6)", () => {
    const vector = makeVector();
    expect(isAdversarialReviewVector(vector)).toBe(false);
  });
});

describe("validateAdversarialReviewerIdentity", () => {
  it("passes when reviewer differs from the preceding reporter (RULE-VEC-7, RULE-VEC-8)", () => {
    expect(() =>
      validateAdversarialReviewerIdentity("reviewer-1", "builder-1"),
    ).not.toThrow();
  });

  it("throws VectorError when reviewer is the same as the preceding reporter (RULE-VEC-7, RULE-VEC-8)", () => {
    expect(() => validateAdversarialReviewerIdentity("pilot-1", "pilot-1")).toThrow(VectorError);
  });

  it("includes RULE-VEC-8 in the thrown error ruleId", () => {
    try {
      validateAdversarialReviewerIdentity("pilot-1", "pilot-1");
    } catch (err) {
      expect(err).toBeInstanceOf(VectorError);
      expect((err as VectorError).ruleId).toBe("RULE-VEC-8");
    }
  });
});

describe("validateAdversarialReviewerSeat", () => {
  it("passes when reviewer holds Captain seat (RULE-VEC-9)", () => {
    expect(() => validateAdversarialReviewerSeat(SeatType.Captain)).not.toThrow();
  });

  it("passes when reviewer holds FirstOfficer seat (RULE-VEC-9)", () => {
    expect(() => validateAdversarialReviewerSeat(SeatType.FirstOfficer)).not.toThrow();
  });

  it("throws VectorError when reviewer holds Jumpseat (RULE-VEC-9)", () => {
    expect(() => validateAdversarialReviewerSeat(SeatType.Jumpseat)).toThrow(VectorError);
  });

  it("includes RULE-VEC-9 in the thrown error ruleId", () => {
    try {
      validateAdversarialReviewerSeat(SeatType.Jumpseat);
    } catch (err) {
      expect(err).toBeInstanceOf(VectorError);
      expect((err as VectorError).ruleId).toBe("RULE-VEC-9");
    }
  });
});
