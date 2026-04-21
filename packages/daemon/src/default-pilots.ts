/**
 * Default pilot definitions seeded into every new project.
 *
 * Each entry represents a pre-configured JS/TS specialist ready to captain
 * or serve as first officer on crafts that match their certifications. Projects
 * may add, remove, or modify pilots at any time after creation.
 *
 * @see RULE-PILOT-1 for pilot identity requirements.
 * @see RULE-PILOT-2 for how certifications gate seat eligibility.
 * @see RULE-SEAT-2 for seat assignment rules.
 */

import type { PilotRecord } from "./types.js";

/**
 * Base pilot definitions included in every new project by default.
 *
 * Three specialists cover the common JS/TS engineering roles:
 * - `pilot-frontend-ts` — UI and browser-side code
 * - `pilot-backend-ts` — APIs, services, and data layers
 * - `pilot-architect-ts` — Full-stack; leads cross-cutting work
 *
 * @see RULE-PILOT-1
 * @see RULE-PILOT-2
 */
export const DEFAULT_PILOTS: readonly PilotRecord[] = [
  {
    identifier: "pilot-frontend-ts",
    certifications: ["Frontend Engineering"],
    mcpServers: {},
  },
  {
    identifier: "pilot-backend-ts",
    certifications: ["Backend Engineering"],
    mcpServers: {},
  },
  {
    identifier: "pilot-architect-ts",
    certifications: ["Frontend Engineering", "Backend Engineering"],
    mcpServers: {},
  },
] as const;
