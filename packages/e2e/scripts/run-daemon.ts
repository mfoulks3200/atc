/**
 * Boots the ATC daemon against a throwaway profile for use as a
 * Playwright `webServer`. A fresh temp directory is allocated on start,
 * seeded with a minimal profile `config.json`, and removed on shutdown.
 *
 * Environment:
 * - ATC_E2E_DAEMON_PORT - TCP port the daemon should listen on (default 7799).
 * - ATC_E2E_TMP_PARENT  - Optional parent directory for the scratch profile.
 */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Daemon } from "@airtrafficcontrol/daemon";

const port = Number(process.env.ATC_E2E_DAEMON_PORT ?? 7799);
const parent = process.env.ATC_E2E_TMP_PARENT ?? tmpdir();

const atcDir = await mkdtemp(join(parent, "atc-e2e-"));
const profileDir = join(atcDir, "profiles", "default");
await mkdir(profileDir, { recursive: true });

await writeFile(
  join(atcDir, "config.json"),
  JSON.stringify({ defaultProfile: "default" }, null, 2),
);
await writeFile(
  join(profileDir, "config.json"),
  JSON.stringify(
    {
      port,
      host: "127.0.0.1",
      logLevel: "warn",
      autoRecover: false,
      wsHeartbeatInterval: 15,
      stateFlushInterval: 30,
      adapter: { type: "claude-agent-sdk", config: {} },
    },
    null,
    2,
  ),
);

const daemon = new Daemon(profileDir, atcDir);
await daemon.start();
console.log(`[e2e] daemon listening on http://127.0.0.1:${daemon.port} (scratch=${atcDir})`);

let cleaning = false;
async function cleanup(code = 0): Promise<never> {
  if (cleaning) process.exit(code);
  cleaning = true;
  try {
    await daemon.stop();
  } catch (err) {
    console.error("[e2e] daemon.stop() failed:", err);
  }
  try {
    await rm(atcDir, { recursive: true, force: true });
  } catch (err) {
    console.error("[e2e] tmp cleanup failed:", err);
  }
  process.exit(code);
}

process.on("SIGTERM", () => void cleanup(0));
process.on("SIGINT", () => void cleanup(0));
process.on("uncaughtException", (err) => {
  console.error("[e2e] uncaught:", err);
  void cleanup(1);
});
