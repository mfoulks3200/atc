import { describe, it, expect } from "vitest";
import { runVectorCommand, buildCommandEnv } from "./vector-command.js";
import * as os from "node:os";
import { realpathSync } from "node:fs";

const CWD = os.tmpdir();

const CTX = { callsign: "alpha-01", vectorName: "setup-db" };

// ---------------------------------------------------------------------------
// buildCommandEnv
// ---------------------------------------------------------------------------

describe("buildCommandEnv", () => {
  it("always includes ATC_CRAFT_ID, ATC_CALLSIGN, ATC_VECTOR_NAME", () => {
    const env = buildCommandEnv(CTX);
    expect(env["ATC_CRAFT_ID"]).toBe("alpha-01");
    expect(env["ATC_CALLSIGN"]).toBe("alpha-01");
    expect(env["ATC_VECTOR_NAME"]).toBe("setup-db");
  });

  it("passes through PATH from process.env", () => {
    const env = buildCommandEnv(CTX);
    expect(env["PATH"]).toBe(process.env.PATH);
  });

  it("includes GIT_DIR when provided", () => {
    const env = buildCommandEnv({ ...CTX, gitDir: "/tmp/repo.git" });
    expect(env["GIT_DIR"]).toBe("/tmp/repo.git");
  });

  it("omits GIT_DIR when not provided", () => {
    const env = buildCommandEnv(CTX);
    expect("GIT_DIR" in env).toBe(false);
  });

  it("does not include arbitrary process env vars (RULE-VCMD-4)", () => {
    const env = buildCommandEnv(CTX);
    const allowlist = new Set(["PATH", "GIT_DIR", "ATC_CRAFT_ID", "ATC_CALLSIGN", "ATC_VECTOR_NAME"]);
    for (const key of Object.keys(env)) {
      expect(allowlist.has(key)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// runVectorCommand — happy path
// ---------------------------------------------------------------------------

describe("runVectorCommand — success", () => {
  it("returns passed when command exits 0 (RULE-VCMD-3)", async () => {
    const result = await runVectorCommand("exit 0", CWD, CTX);
    expect(result.status).toBe("passed");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it("captures stdout", async () => {
    const result = await runVectorCommand("echo hello", CWD, CTX);
    expect(result.stdout).toContain("hello");
    expect(result.status).toBe("passed");
  });

  it("populates durationMs and ranAt", async () => {
    const result = await runVectorCommand("exit 0", CWD, CTX);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.ranAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("sets empty stdout/stderr when command produces none", async () => {
    const result = await runVectorCommand("exit 0", CWD, CTX);
    expect(typeof result.stdout).toBe("string");
    expect(typeof result.stderr).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// runVectorCommand — failure
// ---------------------------------------------------------------------------

describe("runVectorCommand — failure", () => {
  it("returns failed when command exits non-zero (RULE-VCMD-5)", async () => {
    const result = await runVectorCommand("exit 1", CWD, CTX);
    expect(result.status).toBe("failed");
    expect(result.timedOut).toBe(false);
  });

  it("captures stderr on failure", async () => {
    const result = await runVectorCommand("echo oops >&2; exit 1", CWD, CTX);
    expect(result.stderr).toContain("oops");
  });
});

// ---------------------------------------------------------------------------
// runVectorCommand — timeout
// ---------------------------------------------------------------------------

describe("runVectorCommand — timeout", () => {
  it("returns timed_out when command exceeds timeout (RULE-VCMD-6)", async () => {
    const result = await runVectorCommand("sleep 60", CWD, CTX, 100);
    expect(result.status).toBe("timed_out");
    expect(result.timedOut).toBe(true);
  }, 5000);

  it("clamps timeout to MAX_TIMEOUT_MS (300 000 ms)", async () => {
    // We can't wait 5 minutes in a test, so just verify the clamp doesn't
    // throw and that the command runs. Use a command that succeeds quickly.
    const result = await runVectorCommand("exit 0", CWD, CTX, 999_999);
    expect(result.status).toBe("passed");
  });
});

// ---------------------------------------------------------------------------
// runVectorCommand — output truncation (RULE-VCMD-7)
// ---------------------------------------------------------------------------

describe("runVectorCommand — output truncation", () => {
  it("truncates stdout to 64 KB", async () => {
    // Generate ~100 KB of output, expect truncation to ≤ 64 KB
    const result = await runVectorCommand(
      `dd if=/dev/urandom bs=1 count=102400 2>/dev/null | base64`,
      CWD,
      CTX,
    );
    expect(Buffer.byteLength(result.stdout, "utf8")).toBeLessThanOrEqual(64 * 1024);
  }, 10_000);

  it("truncates stderr to 16 KB", async () => {
    // Generate ~32 KB on stderr
    const result = await runVectorCommand(
      `dd if=/dev/urandom bs=1 count=32768 2>/dev/null | base64 >&2; exit 1`,
      CWD,
      CTX,
    );
    expect(Buffer.byteLength(result.stderr, "utf8")).toBeLessThanOrEqual(16 * 1024);
  }, 10_000);
});

// ---------------------------------------------------------------------------
// runVectorCommand — environment injection (RULE-VCMD-4)
// ---------------------------------------------------------------------------

describe("runVectorCommand — environment injection", () => {
  it("injects ATC_CALLSIGN into the command environment", async () => {
    const result = await runVectorCommand("echo $ATC_CALLSIGN", CWD, CTX);
    expect(result.stdout).toContain("alpha-01");
  });

  it("injects ATC_VECTOR_NAME into the command environment", async () => {
    const result = await runVectorCommand("echo $ATC_VECTOR_NAME", CWD, CTX);
    expect(result.stdout).toContain("setup-db");
  });

  it("does not expose arbitrary environment variables to the command (RULE-VCMD-4)", async () => {
    // HOME should not be present in the restricted environment
    const result = await runVectorCommand("echo ${HOME:-NOT_SET}", CWD, CTX);
    expect(result.stdout.trim()).toBe("NOT_SET");
  });

  it("uses the provided working directory", async () => {
    const result = await runVectorCommand("pwd", CWD, CTX);
    // Use realpathSync to resolve symlinks on macOS (/private/tmp vs /tmp)
    expect(realpathSync(result.stdout.trim())).toBe(realpathSync(CWD));
  });
});
