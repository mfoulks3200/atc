/**
 * CLI entry point for `pnpm run seed:demo`.
 *
 * Thin wrapper around {@link runSeedDemoCli} — all logic lives in that
 * function so the behavior can be unit-tested without spawning a
 * subprocess.
 *
 * Usage:
 *   pnpm --filter @airtrafficcontrol/daemon run seed:demo [profileDir] [--force]
 */

import { runSeedDemoCli } from "./seed-demo.js";

await runSeedDemoCli(process.argv.slice(2));
