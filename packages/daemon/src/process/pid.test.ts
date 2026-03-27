import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isProcessAlive, readPidFile, removePidFile, writePidFile } from "./pid.js";

describe("pid utilities", () => {
  let dir: string;
  let pidPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "atc-pid-test-"));
    pidPath = join(dir, "daemon.pid");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe("writePidFile + readPidFile roundtrip", () => {
    it("writes and reads back the current process PID", async () => {
      await writePidFile(pidPath);
      const pid = await readPidFile(pidPath);
      expect(pid).toBe(process.pid);
    });
  });

  describe("readPidFile", () => {
    it("returns null when the file does not exist", async () => {
      const result = await readPidFile(join(dir, "nonexistent.pid"));
      expect(result).toBeNull();
    });
  });

  describe("removePidFile", () => {
    it("removes the file so subsequent reads return null", async () => {
      await writePidFile(pidPath);
      await removePidFile(pidPath);
      const pid = await readPidFile(pidPath);
      expect(pid).toBeNull();
    });

    it("does not throw when the file is already missing", async () => {
      await expect(removePidFile(join(dir, "ghost.pid"))).resolves.toBeUndefined();
    });
  });

  describe("isProcessAlive", () => {
    it("returns true for the current process PID", () => {
      expect(isProcessAlive(process.pid)).toBe(true);
    });

    it("returns false for a PID that is almost certainly not running", () => {
      expect(isProcessAlive(999999)).toBe(false);
    });
  });
});
