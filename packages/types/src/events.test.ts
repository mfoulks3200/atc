import { describe, it, expect } from "vitest";
import { LifecycleEvent } from "./events.js";

describe("LifecycleEvent", () => {
  it("defines all before/after event pairs", () => {
    expect(LifecycleEvent.BeforeTakeoff).toBe("before:takeoff");
    expect(LifecycleEvent.AfterTakeoff).toBe("after:takeoff");
    expect(LifecycleEvent.BeforeVectorComplete).toBe("before:vector-complete");
    expect(LifecycleEvent.AfterVectorComplete).toBe("after:vector-complete");
    expect(LifecycleEvent.BeforeLandingCheck).toBe("before:landing-check");
    expect(LifecycleEvent.AfterLandingCheck).toBe("after:landing-check");
    expect(LifecycleEvent.BeforeGoAround).toBe("before:go-around");
    expect(LifecycleEvent.AfterGoAround).toBe("after:go-around");
    expect(LifecycleEvent.BeforeEmergency).toBe("before:emergency");
    expect(LifecycleEvent.AfterEmergency).toBe("after:emergency");
    expect(LifecycleEvent.BeforeLanding).toBe("before:landing");
    expect(LifecycleEvent.AfterLanding).toBe("after:landing");
  });

  it("has exactly 12 values", () => {
    const values = Object.values(LifecycleEvent);
    expect(values).toHaveLength(12);
  });

  it("all before events start with 'before:'", () => {
    const beforeEvents = Object.values(LifecycleEvent).filter((v) => v.startsWith("before:"));
    expect(beforeEvents).toHaveLength(6);
  });

  it("all after events start with 'after:'", () => {
    const afterEvents = Object.values(LifecycleEvent).filter((v) => v.startsWith("after:"));
    expect(afterEvents).toHaveLength(6);
  });
});
