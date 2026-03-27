import { describe, it, expect } from "vitest";
import { queryKeys } from "./query-keys.js";

describe("queryKeys", () => {
  it("generates health key", () => {
    expect(queryKeys.health()).toEqual(["health"]);
  });

  it("generates status key", () => {
    expect(queryKeys.status()).toEqual(["status"]);
  });

  it("generates project keys", () => {
    expect(queryKeys.projects.list()).toEqual(["projects"]);
    expect(queryKeys.projects.detail("acme")).toEqual(["projects", "acme"]);
  });

  it("generates craft keys", () => {
    expect(queryKeys.crafts.list("acme")).toEqual(["crafts", "acme"]);
    expect(queryKeys.crafts.detail("acme", "fix-auth")).toEqual(["crafts", "acme", "fix-auth"]);
  });

  it("generates craft sub-resource keys", () => {
    expect(queryKeys.crafts.blackBox("acme", "fix-auth")).toEqual([
      "crafts",
      "acme",
      "fix-auth",
      "blackbox",
    ]);
    expect(queryKeys.crafts.intercom("acme", "fix-auth")).toEqual([
      "crafts",
      "acme",
      "fix-auth",
      "intercom",
    ]);
    expect(queryKeys.crafts.vectors("acme", "fix-auth")).toEqual([
      "crafts",
      "acme",
      "fix-auth",
      "vectors",
    ]);
  });

  it("generates agent keys", () => {
    expect(queryKeys.agents.list()).toEqual(["agents"]);
    expect(queryKeys.agents.detail("a-1")).toEqual(["agents", "a-1"]);
    expect(queryKeys.agents.usage("a-1")).toEqual(["agents", "a-1", "usage"]);
  });

  it("generates tower key", () => {
    expect(queryKeys.tower.queue("acme")).toEqual(["tower", "acme"]);
  });
});
