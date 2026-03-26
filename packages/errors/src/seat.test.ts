import { describe, it, expect } from "vitest";
import { SeatAssignmentError } from "./seat.js";
import { AtcError } from "./base.js";

describe("SeatAssignmentError", () => {
  it("extends AtcError", () => {
    const err = new SeatAssignmentError("uncertified in captain seat", "RULE-SEAT-2");
    expect(err).toBeInstanceOf(AtcError);
    expect(err).toBeInstanceOf(Error);
  });

  it("stores message and ruleId", () => {
    const err = new SeatAssignmentError("uncertified pilot", "RULE-SEAT-2");
    expect(err.message).toBe("uncertified pilot");
    expect(err.ruleId).toBe("RULE-SEAT-2");
  });

  it("has name set to SeatAssignmentError", () => {
    const err = new SeatAssignmentError("msg", "RULE-SEAT-2");
    expect(err.name).toBe("SeatAssignmentError");
  });
});
