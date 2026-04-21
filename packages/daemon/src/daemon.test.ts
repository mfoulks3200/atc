/**
 * Tests for the top-level Daemon class.
 *
 * Each test creates an isolated temporary profile directory and a Daemon
 * instance bound to port 0 (random OS-assigned port) so tests never conflict.
 */

import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
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
    // @ts-expect-error — Server inherits .on() from EventEmitter at runtime
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
  let atcDir: string;
  let daemon: Daemon;

  beforeEach(async () => {
    const port = await getFreePort();
    atcDir = await mkdtemp(join(tmpdir(), "atc-daemon-test-"));
    const profileRoot = join(atcDir, "profiles", "default");
    await mkdir(profileRoot, { recursive: true });
    profileDir = await scaffoldProfile(profileRoot, port);
    daemon = new Daemon(profileDir, atcDir);
  });

  afterEach(async () => {
    // Ensure the daemon is stopped even if a test throws
    if (daemon.isRunning) {
      await daemon.stop();
    }
    await rm(atcDir, { recursive: true, force: true });
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

describe("Daemon — global config integration", () => {
  it("PATCH over HTTP persists diff and broadcasts over WS", async () => {
    const port = await getFreePort();
    const atcDir = await mkdtemp(join(tmpdir(), "atc-int-"));
    const profileDir = join(atcDir, "profiles", "default");
    await mkdir(profileDir, { recursive: true });
    await scaffoldProfile(profileDir, port);

    const daemon = new Daemon(profileDir, atcDir);
    await daemon.start();
    const baseUrl = `http://127.0.0.1:${daemon.port}`;

    const ws = new WebSocket(`ws://127.0.0.1:${daemon.port}/ws`);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", (err) => reject(err));
    });
    const received: unknown[] = [];
    ws.on("message", (raw: Buffer) => {
      received.push(JSON.parse(raw.toString()));
    });
    ws.send(JSON.stringify({ type: "subscribe", channel: "config:global" }));
    await new Promise((r) => setTimeout(r, 50));

    const res = await fetch(`${baseUrl}/api/v1/config/global`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultProfile: "staging" }),
    });
    expect(res.status).toBe(200);

    const raw = JSON.parse(await readFile(join(atcDir, "config.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(raw).toEqual({ defaultProfile: "staging" });

    await new Promise((r) => setTimeout(r, 60));
    const broadcast = received.find(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        ("config" in m || (m as { channel?: string }).channel === "config:global"),
    );
    expect(broadcast).toBeDefined();

    ws.close();
    await daemon.stop();
    await rm(atcDir, { recursive: true, force: true });
  }, 10_000);
});
