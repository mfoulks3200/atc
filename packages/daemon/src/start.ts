/**
 * Entry point for running the ATC daemon from the command line.
 *
 * Usage: node --import tsx packages/daemon/src/start.ts [profileDir]
 *
 * Defaults to ~/.atc/profiles/default. Derives atcDir as two directories up
 * from profileDir (i.e. ~/.atc).
 */

import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { mkdir } from "node:fs/promises";
import { Daemon } from "./daemon.js";
import { AdapterRegistry } from "./adapters/registry.js";
import { ClaudeAgentSdkAdapter } from "@airtrafficcontrol/adapter-claude-agent-sdk";

const profileDir = process.argv[2] ?? join(homedir(), ".atc", "profiles", "default");
const absProfileDir = resolve(profileDir);
const atcDir = dirname(dirname(absProfileDir));

await mkdir(absProfileDir, { recursive: true });
await mkdir(atcDir, { recursive: true });

const adapterRegistry = new AdapterRegistry();
adapterRegistry.register("claude-agent-sdk", new ClaudeAgentSdkAdapter());

const daemon = new Daemon(absProfileDir, atcDir, adapterRegistry);
await daemon.start();

console.log(`ATC daemon listening on port ${daemon.port}`);
