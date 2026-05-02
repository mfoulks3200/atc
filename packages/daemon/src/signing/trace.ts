/**
 * OTel trace context generation for Black Box entries.
 *
 * Implements RULE-BBOX-5: when trace context is enabled for a project, every
 * black box entry carries a `traceContext` object.
 *
 * - `traceId`: 32 hex characters, derived deterministically from craft callsign
 *   and project name via SHA-256 (first 16 bytes → 32 hex chars).
 * - `spanId`: 16 hex characters, randomly generated per entry.
 * - `parentSpanId`: the spanId of the immediately preceding entry, or null for
 *   root spans (e.g. the initial `CraftCreated` entry).
 *
 * All ATC-specific attributes use the `atc.*` namespace.
 *
 * @see RULE-BBOX-5
 */

import { createHash, randomBytes } from "node:crypto";
import type { TraceContext } from "../types.js";

/**
 * Derives a deterministic 32-hex-char trace ID from the craft callsign and project name.
 *
 * The same craft always produces the same traceId across daemon restarts,
 * enabling correlation of all entries in a craft's black box as one trace.
 *
 * @see RULE-BBOX-5
 */
export function deriveTraceId(projectName: string, craftCallsign: string): string {
  return createHash("sha256").update(`${projectName}:${craftCallsign}`).digest("hex").slice(0, 32);
}

/**
 * Generates a random 16-hex-char span ID for a single black box entry.
 *
 * @see RULE-BBOX-5
 */
export function generateSpanId(): string {
  return randomBytes(8).toString("hex");
}

/**
 * Produces a `TraceContext` object for a new black box entry.
 *
 * @param projectName - Name of the project (used for traceId derivation).
 * @param craftCallsign - Callsign of the craft (used for traceId derivation).
 * @param parentSpanId - spanId of the immediately preceding entry, or null.
 * @returns A populated `TraceContext`.
 *
 * @see RULE-BBOX-5
 */
export function generateTraceContext(
  projectName: string,
  craftCallsign: string,
  parentSpanId: string | null,
): TraceContext {
  return {
    traceId: deriveTraceId(projectName, craftCallsign),
    spanId: generateSpanId(),
    parentSpanId,
  };
}
