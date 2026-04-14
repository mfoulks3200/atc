import { describe, it, expect } from "vitest";
import {
  GLOBAL_CONFIG_SCHEMA,
  PROFILE_CONFIG_SCHEMA,
  GLOBAL_CONFIG_DEFAULTS,
  PROFILE_CONFIG_DEFAULTS,
  PROJECT_METADATA_SCHEMA,
  PROJECT_METADATA_DEFAULTS,
} from "./schema.js";

describe("GLOBAL_CONFIG_SCHEMA", () => {
  it("accepts defaults", () => {
    expect(() => GLOBAL_CONFIG_SCHEMA.parse(GLOBAL_CONFIG_DEFAULTS)).not.toThrow();
  });

  it("rejects a non-string defaultProfile", () => {
    const result = GLOBAL_CONFIG_SCHEMA.safeParse({ defaultProfile: 42 });
    expect(result.success).toBe(false);
  });

  it("preserves unknown top-level fields (passthrough)", () => {
    const parsed = GLOBAL_CONFIG_SCHEMA.parse({
      defaultProfile: "main",
      unknownKey: "kept",
    }) as Record<string, unknown>;
    expect(parsed["unknownKey"]).toBe("kept");
  });
});

describe("PROFILE_CONFIG_SCHEMA", () => {
  it("accepts defaults", () => {
    expect(() => PROFILE_CONFIG_SCHEMA.parse(PROFILE_CONFIG_DEFAULTS)).not.toThrow();
  });

  it("rejects out-of-range port", () => {
    const result = PROFILE_CONFIG_SCHEMA.safeParse({
      ...PROFILE_CONFIG_DEFAULTS,
      port: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer port", () => {
    const result = PROFILE_CONFIG_SCHEMA.safeParse({
      ...PROFILE_CONFIG_DEFAULTS,
      port: 1234.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a bad logLevel", () => {
    const result = PROFILE_CONFIG_SCHEMA.safeParse({
      ...PROFILE_CONFIG_DEFAULTS,
      logLevel: "trace",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean autoRecover", () => {
    const result = PROFILE_CONFIG_SCHEMA.safeParse({
      ...PROFILE_CONFIG_DEFAULTS,
      autoRecover: "yes",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-object adapter", () => {
    const result = PROFILE_CONFIG_SCHEMA.safeParse({
      ...PROFILE_CONFIG_DEFAULTS,
      adapter: "claude",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-string adapter.type", () => {
    const result = PROFILE_CONFIG_SCHEMA.safeParse({
      ...PROFILE_CONFIG_DEFAULTS,
      adapter: { type: 1, config: {} },
    });
    expect(result.success).toBe(false);
  });

  it("preserves unknown top-level fields", () => {
    const parsed = PROFILE_CONFIG_SCHEMA.parse({
      ...PROFILE_CONFIG_DEFAULTS,
      extra: true,
    }) as Record<string, unknown>;
    expect(parsed["extra"]).toBe(true);
  });
});

describe("PROJECT_METADATA_SCHEMA", () => {
  it("accepts a complete valid ProjectMetadata object", () => {
    const valid = {
      name: "my-project",
      remoteUrl: "https://github.com/org/repo.git",
      categories: ["feature", "backend"],
      checklist: [
        { name: "Tests", command: "pnpm run test", timeout: 60000 },
        { name: "Lint", command: "pnpm run lint" },
      ],
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
          env: { DEBUG: "1" },
        },
      },
    };
    expect(() => PROJECT_METADATA_SCHEMA.parse(valid)).not.toThrow();
  });

  it("accepts defaults", () => {
    expect(() => PROJECT_METADATA_SCHEMA.parse(PROJECT_METADATA_DEFAULTS)).not.toThrow();
  });

  it("rejects a checklist item missing required 'command' field", () => {
    const result = PROJECT_METADATA_SCHEMA.safeParse({
      ...PROJECT_METADATA_DEFAULTS,
      checklist: [{ name: "Tests" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a checklist item with a non-string name", () => {
    const result = PROJECT_METADATA_SCHEMA.safeParse({
      ...PROJECT_METADATA_DEFAULTS,
      checklist: [{ name: 42, command: "pnpm test" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an mcpServer entry missing required 'args' field", () => {
    const result = PROJECT_METADATA_SCHEMA.safeParse({
      ...PROJECT_METADATA_DEFAULTS,
      mcpServers: {
        bad: { command: "npx" },
      },
    });
    expect(result.success).toBe(false);
  });

  it("preserves unknown fields via passthrough", () => {
    const parsed = PROJECT_METADATA_SCHEMA.parse({
      ...PROJECT_METADATA_DEFAULTS,
      customField: "retained",
    }) as Record<string, unknown>;
    expect(parsed["customField"]).toBe("retained");
  });
});
