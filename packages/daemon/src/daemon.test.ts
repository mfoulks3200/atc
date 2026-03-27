/**
 * Tests for the top-level Daemon class.
 *
 * Each test creates an isolated temporary profile directory and a Daemon
 * instance bound to port 0 (random OS-assigned port) so tests never conflict.
 */

import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Daemon } from "./daemon.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a free TCP port by briefly binding to port 0 and reading the
 * OS-assigned address, then closing the server before returning.
 */
async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr !== null ? addr.port : null;
      server.close((err) => {
        if (err !== undefined) {
          reject(err);
          return;
        }
        if (port === null) {
          reject(new Error("Failed to get free port"));
          return;
        }
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

/**
 * Creates a minimal profile directory that loadProfileConfig will accept.
 *
 * @param root - Temporary root created by mkdtemp.
 * @param port - TCP port to configure (must be 1-65535).
 */
async function scaffoldProfile(root: string, port: number): Promise<string> {
  // Create standard subdirectories
  for (const dir of ["logs", "state", "projects", "workspaces"]) {
    await mkdir(join(root, dir), { recursive: true });
  }

  const config = {
    port,
    host: "127.0.0.1",
    logLevel: "error",
    autoRecover: false,
    wsHeartbeatInterval: 15,
    stateFlushInterval: 60000,
  };
  await writeFile(join(root, "config.json"), JSON.stringify(config), "utf-8");

  return root;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Daemon", () => {
  let profileDir: string;
  let daemon: Daemon;

  beforeEach(async () => {
    const port = await getFreePort();
    const tmp = await mkdtemp(join(tmpdir(), "atc-daemon-test-"));
    profileDir = await scaffoldProfile(tmp, port);
    daemon = new Daemon(profileDir);
  });

  afterEach(async () => {
    // Ensure the daemon is stopped even if a test throws
    if (daemon.isRunning) {
      await daemon.stop();
    }
    await rm(profileDir, { recursive: true, force: true });
  });

  it("creates a daemon instance", () => {
    expect(daemon).toBeInstanceOf(Daemon);
    expect(daemon.isRunning).toBe(false);
    expect(daemon.port).toBe(0);
  });

  it("starts and stops cleanly", async () => {
    await daemon.start();
    expect(daemon.isRunning).toBe(true);

    await daemon.stop();
    expect(daemon.isRunning).toBe(false);
  });

  it("exposes the bound port after start", async () => {
    await daemon.start();

    // The daemon should report a real port it is bound to
    expect(daemon.port).toBeGreaterThan(0);
    expect(daemon.port).toBeLessThanOrEqual(65535);

    await daemon.stop();
  });

  it("stop() is idempotent when already stopped", async () => {
    await daemon.start();
    await daemon.stop();

    // Second stop should not throw
    await expect(daemon.stop()).resolves.toBeUndefined();
    expect(daemon.isRunning).toBe(false);
  });

  it("isRunning is false before start", () => {
    expect(daemon.isRunning).toBe(false);
  });

  it("isRunning transitions from false to true to false", async () => {
    expect(daemon.isRunning).toBe(false);

    await daemon.start();
    expect(daemon.isRunning).toBe(true);

    await daemon.stop();
    expect(daemon.isRunning).toBe(false);
  });
});
