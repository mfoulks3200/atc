/**
 * Tests for environment variable config loading and Zod validation.
 *
 * Uses vitest's vi.stubEnv to isolate process.env mutations — each test
 * starts with a clean slate and env is restored after each test.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { ConfigValidationError } from "@airtrafficcontrol/errors";
import { loadEnvOverrides, ENV_SCHEMA } from "./env.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// ENV_SCHEMA — unit tests for the Zod schema itself
// ---------------------------------------------------------------------------

describe("ENV_SCHEMA", () => {
  describe("ATC_PORT", () => {
    it("accepts a valid port string", () => {
      const result = ENV_SCHEMA.safeParse({ ATC_PORT: "8080" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.ATC_PORT).toBe(8080);
    });

    it("accepts the minimum port (1)", () => {
      const result = ENV_SCHEMA.safeParse({ ATC_PORT: "1" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.ATC_PORT).toBe(1);
    });

    it("accepts the maximum port (65535)", () => {
      const result = ENV_SCHEMA.safeParse({ ATC_PORT: "65535" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.ATC_PORT).toBe(65535);
    });

    it("rejects a non-numeric string", () => {
      const result = ENV_SCHEMA.safeParse({ ATC_PORT: "not-a-number" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toContain("ATC_PORT");
      }
    });

    it("rejects a decimal port", () => {
      const result = ENV_SCHEMA.safeParse({ ATC_PORT: "80.5" });
      expect(result.success).toBe(false);
    });

    it("rejects port 0", () => {
      const result = ENV_SCHEMA.safeParse({ ATC_PORT: "0" });
      expect(result.success).toBe(false);
    });

    it("rejects port 65536", () => {
      const result = ENV_SCHEMA.safeParse({ ATC_PORT: "65536" });
      expect(result.success).toBe(false);
    });

    it("rejects a negative port", () => {
      const result = ENV_SCHEMA.safeParse({ ATC_PORT: "-1" });
      expect(result.success).toBe(false);
    });

    it("is optional — absent key passes", () => {
      const result = ENV_SCHEMA.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.ATC_PORT).toBeUndefined();
    });
  });

  describe("ATC_HOST", () => {
    it("accepts a valid hostname", () => {
      const result = ENV_SCHEMA.safeParse({ ATC_HOST: "0.0.0.0" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.ATC_HOST).toBe("0.0.0.0");
    });

    it("accepts localhost", () => {
      const result = ENV_SCHEMA.safeParse({ ATC_HOST: "localhost" });
      expect(result.success).toBe(true);
    });

    it("rejects an empty string", () => {
      const result = ENV_SCHEMA.safeParse({ ATC_HOST: "" });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.includes("ATC_HOST"));
        expect(issue?.message).toMatch(/must not be empty/);
      }
    });

    it("is optional — absent key passes", () => {
      const result = ENV_SCHEMA.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.ATC_HOST).toBeUndefined();
    });
  });

  describe("ATC_LOG_LEVEL", () => {
    it.each(["debug", "info", "warn", "error"] as const)("accepts %s", (level) => {
      const result = ENV_SCHEMA.safeParse({ ATC_LOG_LEVEL: level });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.ATC_LOG_LEVEL).toBe(level);
    });

    it("rejects an unknown log level", () => {
      const result = ENV_SCHEMA.safeParse({ ATC_LOG_LEVEL: "verbose" });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.includes("ATC_LOG_LEVEL"));
        expect(issue?.message).toMatch(/debug.*info.*warn.*error/i);
      }
    });

    it("is optional — absent key passes", () => {
      const result = ENV_SCHEMA.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.ATC_LOG_LEVEL).toBeUndefined();
    });
  });

  describe("ATC_STATE_DIR", () => {
    it("accepts a valid path", () => {
      const result = ENV_SCHEMA.safeParse({ ATC_STATE_DIR: "/var/atc/state" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.ATC_STATE_DIR).toBe("/var/atc/state");
    });

    it("rejects an empty string", () => {
      const result = ENV_SCHEMA.safeParse({ ATC_STATE_DIR: "" });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.includes("ATC_STATE_DIR"));
        expect(issue?.message).toMatch(/must not be empty/);
      }
    });

    it("is optional — absent key passes", () => {
      const result = ENV_SCHEMA.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.ATC_STATE_DIR).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// loadEnvOverrides — integration with process.env
// ---------------------------------------------------------------------------

describe("loadEnvOverrides", () => {
  it("returns empty overrides when no ATC_* vars are set", () => {
    const result = loadEnvOverrides();
    expect(result.profileOverrides).toEqual({});
    expect(result.stateDir).toBeUndefined();
  });

  it("reads ATC_PORT and coerces to number", () => {
    vi.stubEnv("ATC_PORT", "9000");
    const result = loadEnvOverrides();
    expect(result.profileOverrides.port).toBe(9000);
  });

  it("reads ATC_HOST", () => {
    vi.stubEnv("ATC_HOST", "0.0.0.0");
    const result = loadEnvOverrides();
    expect(result.profileOverrides.host).toBe("0.0.0.0");
  });

  it("reads ATC_LOG_LEVEL", () => {
    vi.stubEnv("ATC_LOG_LEVEL", "debug");
    const result = loadEnvOverrides();
    expect(result.profileOverrides.logLevel).toBe("debug");
  });

  it("reads ATC_STATE_DIR into stateDir", () => {
    vi.stubEnv("ATC_STATE_DIR", "/tmp/atc-state");
    const result = loadEnvOverrides();
    expect(result.stateDir).toBe("/tmp/atc-state");
    expect(result.profileOverrides.port).toBeUndefined();
  });

  it("reads all four variables simultaneously", () => {
    vi.stubEnv("ATC_PORT", "8888");
    vi.stubEnv("ATC_HOST", "0.0.0.0");
    vi.stubEnv("ATC_LOG_LEVEL", "warn");
    vi.stubEnv("ATC_STATE_DIR", "/data/atc");
    const result = loadEnvOverrides();
    expect(result.profileOverrides.port).toBe(8888);
    expect(result.profileOverrides.host).toBe("0.0.0.0");
    expect(result.profileOverrides.logLevel).toBe("warn");
    expect(result.stateDir).toBe("/data/atc");
  });

  it("only includes keys that are set (partial overrides do not shadow unset vars)", () => {
    vi.stubEnv("ATC_PORT", "7701");
    const result = loadEnvOverrides();
    expect(result.profileOverrides).toEqual({ port: 7701 });
    expect("host" in result.profileOverrides).toBe(false);
    expect("logLevel" in result.profileOverrides).toBe(false);
  });

  it("throws ConfigValidationError for invalid ATC_PORT", () => {
    vi.stubEnv("ATC_PORT", "not-a-port");
    expect(() => loadEnvOverrides()).toThrow(ConfigValidationError);
  });

  it("throws ConfigValidationError for out-of-range ATC_PORT", () => {
    vi.stubEnv("ATC_PORT", "99999");
    let err: unknown;
    try {
      loadEnvOverrides();
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigValidationError);
    expect((err as ConfigValidationError).scope).toBe("profile");
    expect((err as ConfigValidationError).issues.length).toBeGreaterThan(0);
  });

  it("throws ConfigValidationError for invalid ATC_LOG_LEVEL with clear message", () => {
    vi.stubEnv("ATC_LOG_LEVEL", "trace");
    let err: unknown;
    try {
      loadEnvOverrides();
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigValidationError);
    const configErr = err as ConfigValidationError;
    expect(configErr.message).toMatch(/ATC_LOG_LEVEL|debug|info|warn|error/i);
  });

  it("throws ConfigValidationError for empty ATC_HOST", () => {
    vi.stubEnv("ATC_HOST", "");
    expect(() => loadEnvOverrides()).toThrow(ConfigValidationError);
  });

  it("throws ConfigValidationError for empty ATC_STATE_DIR", () => {
    vi.stubEnv("ATC_STATE_DIR", "");
    expect(() => loadEnvOverrides()).toThrow(ConfigValidationError);
  });

  it("error message identifies the problematic variable", () => {
    vi.stubEnv("ATC_PORT", "abc");
    let err: unknown;
    try {
      loadEnvOverrides();
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigValidationError);
    const configErr = err as ConfigValidationError;
    const issue = configErr.issues[0];
    expect(issue?.path).toContain("ATC_PORT");
  });
});
