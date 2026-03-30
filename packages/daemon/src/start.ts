/**
 * Entry point for running the ATC daemon from the command line.
 *
 * Usage: node --import tsx packages/daemon/src/start.ts [profileDir]
 *
 * Defaults to ~/.atc/profiles/default if no profile directory is specified.
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir } from "node:fs/promises";
import { Daemon } from "./daemon.js";

const profileDir = process.argv[2] ?? join(homedir(), ".atc", "profiles", "default");

await mkdir(profileDir, { recursive: true });

const daemon = new Daemon(profileDir);
await daemon.start();

console.log(`ATC daemon listening on port ${daemon.port}`);
