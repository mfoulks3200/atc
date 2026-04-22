/**
 * Core SDD (Spec-Driven Development) utility functions.
 *
 * Implements the callsign generation algorithm (§4.6.2) and the pilot
 * auto-selection algorithm (§4.6.4) used by the daemon's spec submission
 * endpoint and file-watcher inbox processor.
 *
 * @see §4.6.2 — Callsign Generation
 * @see §4.6.4 — Pilot Auto-Selection
 * @see RULE-SDD-8, RULE-SDD-9, RULE-SDD-10
 */

// ---------------------------------------------------------------------------
// Callsign generation (§4.6.2)
// ---------------------------------------------------------------------------

/**
 * Generates a unique callsign from a spec title using the §4.6.2 algorithm.
 *
 * Steps:
 * 1. Slugify the title (lowercase, non-alphanumeric → hyphens, collapse, trim).
 * 2. Append a zero-padded monotonic counter: `<slug>-<NN>` (e.g. `add-login-01`).
 * 3. If the candidate collides with an existing callsign, increment and retry.
 *
 * The returned `nextCounter` is the value that should be persisted to the project
 * config store (one past the counter used for this callsign). In dry-run mode the
 * caller MUST NOT persist it (RULE-SDD-15).
 *
 * @param title - Raw spec title. Slugified internally.
 * @param counter - Current callsign counter from the project config store.
 * @param existingCallsigns - Callsigns already in use in this project.
 * @returns `{ callsign, nextCounter }`.
 *
 * @see §4.6.2
 * @see RULE-SDD-5 — callsign must be unique.
 * @see RULE-SDD-15 — dry-run: counter must not be persisted.
 */
export function generateCallsign(
  title: string,
  counter: number,
  existingCallsigns: string[],
): { callsign: string; nextCounter: number } {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const existing = new Set(existingCallsigns);
  let n = counter;

  while (true) {
    const padded = n < 100 ? String(n).padStart(2, "0") : String(n);
    const candidate = `${slug}-${padded}`;
    n++;
    if (!existing.has(candidate)) {
      return { callsign: candidate, nextCounter: n };
    }
  }
}

// ---------------------------------------------------------------------------
// Pilot auto-selection (§4.6.4)
// ---------------------------------------------------------------------------

/**
 * Parameters for the captain auto-selection algorithm.
 *
 * @see §4.6.4
 */
export interface SelectCaptainParams {
  /** The craft category to match certifications against. */
  readonly category: string;
  /**
   * All available pilots with their certification sets and running selection counts.
   * The array is not mutated.
   */
  readonly pilots: ReadonlyArray<{
    readonly identifier: string;
    readonly certifications: readonly string[];
    readonly selectionCount: number;
  }>;
  /** Active crafts used for the tie-break (prefer pilots not currently captaining). */
  readonly activeCrafts: ReadonlyArray<{ readonly captain: string }>;
  /**
   * Weight applied to pilot scoring when they currently hold a first-officer seat
   * on an active craft. Accepted but not used in the core selection sort; reserved
   * for future scheduling refinement.
   */
  readonly foWeight?: number;
  /** Pilot IDs to exclude from auto-selection (spec.pilots.exclude). */
  readonly exclude?: readonly string[];
  /**
   * Additional certifications the selected captain must hold beyond `category`.
   * @see §4.6.4 step 3
   */
  readonly requireCertifications?: readonly string[];
}

/**
 * Auto-selects a captain using the §4.6.4 algorithm.
 *
 * Selection steps:
 * 1. Certification filter — retain pilots certified for `category`.
 * 2. Exclusion filter — remove pilots in `exclude`.
 * 3. Additional certification filter — if `requireCertifications` is non-empty,
 *    further filter to pilots holding all listed certifications.
 * 4. Workload balance — sort ascending by `selectionCount`.
 * 5. Tie-break — among equal counts, prefer pilots not currently captaining an
 *    active craft.
 * 6. Return the top candidate with `selectionCount` incremented by 1.
 *    The input `pilots` array is not mutated.
 *
 * @throws If no pilot survives the filters (RULE-SDD-9).
 *
 * @see §4.6.4
 * @see RULE-SDD-8 — selected captain must be certified.
 * @see RULE-SDD-9 — no eligible pilot → throw with enumerated details.
 */
export function selectCaptain(params: SelectCaptainParams): {
  identifier: string;
  selectionCount: number;
} {
  const { category, pilots, activeCrafts, exclude, requireCertifications } = params;

  // Step 1: Certification filter
  let candidates = pilots.filter((p) => p.certifications.includes(category));

  // Step 2: Exclusion filter
  if (exclude && exclude.length > 0) {
    const excludeSet = new Set(exclude);
    candidates = candidates.filter((p) => !excludeSet.has(p.identifier));
  }

  // Step 3: Additional certification filter
  if (requireCertifications && requireCertifications.length > 0) {
    candidates = candidates.filter((p) =>
      (requireCertifications as string[]).every((cert) => p.certifications.includes(cert)),
    );
  }

  // Step 4 + 5: Sort by selectionCount ascending; tie-break on not-active-captain
  if (candidates.length === 0) {
    const allCerts = pilots
      .map((p) => `${p.identifier} [${p.certifications.join(", ") || "none"}]`)
      .join("; ");
    throw new Error(
      `NO_CERTIFIED_PILOT: No pilot certified for category "${category}". ` +
        `Available pilots: ${allCerts || "none"}`,
    );
  }

  const activeCaptainIds = new Set(activeCrafts.map((c) => c.captain));

  const sorted = [...candidates].sort((a, b) => {
    if (a.selectionCount !== b.selectionCount) {
      return a.selectionCount - b.selectionCount;
    }
    // Prefer pilots not currently captaining an active craft
    const aActive = activeCaptainIds.has(a.identifier) ? 1 : 0;
    const bActive = activeCaptainIds.has(b.identifier) ? 1 : 0;
    return aActive - bActive;
  });

  const selected = sorted[0];
  return { identifier: selected.identifier, selectionCount: selected.selectionCount + 1 };
}
