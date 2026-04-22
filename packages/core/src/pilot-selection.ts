import type { Pilot, Craft, CraftCategory } from "@airtrafficcontrol/types";
import { CraftStatus } from "@airtrafficcontrol/types";
import { NoCertifiedPilotError } from "@airtrafficcontrol/errors";

/** Craft statuses considered "active" for workload scoring. @see §4.6.4 */
const ACTIVE_STATUSES: ReadonlySet<CraftStatus> = new Set([
  CraftStatus.Taxiing,
  CraftStatus.InFlight,
  CraftStatus.LandingChecklist,
]);

/**
 * Parameters shared by both captain and first-officer selection.
 */
export interface SelectionParams {
  /** The craft category — only pilots certified for this category are eligible. */
  category: CraftCategory;
  /** All known pilots in the project. */
  pilots: Pilot[];
  /** All crafts used to compute workload scores. */
  activeCrafts: readonly Craft[];
  /** Weight applied to active FO assignments when computing workload. Default: 0.5. */
  foWeight: number;
  /** Pilot identifiers excluded from auto-selection. @see RULE-SDD-9 */
  exclude?: string[];
  /** Additional certifications every candidate must hold. @see RULE-SDD-8 */
  requireCertifications?: string[];
  /** Minimum number of first officers to select. Default: 0. */
  minFirstOfficers?: number;
}

/**
 * Computes the workload score for a pilot across the given set of crafts.
 *
 * ```
 * score = (active_captaincies × 1.0) + (active_fo_assignments × foWeight)
 * ```
 *
 * "Active" means the craft's status is one of Taxiing, InFlight, or
 * LandingClearanceRequested.
 *
 * @see §4.6.4
 */
export function computeWorkloadScore(
  pilot: Pilot,
  crafts: readonly Craft[],
  foWeight: number,
): number {
  let score = 0;
  for (const craft of crafts) {
    if (!ACTIVE_STATUSES.has(craft.status)) continue;
    if (craft.captain.identifier === pilot.identifier) {
      score += 1.0;
    } else if (craft.firstOfficers.some((fo) => fo.identifier === pilot.identifier)) {
      score += foWeight;
    }
  }
  return score;
}

/**
 * Builds a diagnostic NoCertifiedPilotError that enumerates which pilots were
 * available and why none qualified, per RULE-SDD-9.
 */
function noCandidatesError(
  category: CraftCategory,
  allPilots: Pilot[],
  requireCertifications?: string[],
): NoCertifiedPilotError {
  const pilotSummaries = allPilots
    .map((p) => `  ${p.identifier}: [${p.certifications.join(", ")}]`)
    .join("\n");

  const extra =
    requireCertifications && requireCertifications.length > 0
      ? ` (also requires: ${requireCertifications.join(", ")})`
      : "";

  const message =
    `No pilot certified for category "${category}"${extra} is available.\n` +
    `Available pilots and their certifications:\n${pilotSummaries}`;

  return new NoCertifiedPilotError(message);
}

/**
 * Applies the SDD auto-selection algorithm to a pool of pilots.
 *
 * Steps:
 * 1. Certification filter (category + requireCertifications).
 * 2. Exclusion filter.
 * 3. Sort by workload score ascending.
 * 4. Tie-break by selectionCount ascending.
 *
 * Returns the top candidate with its `selectionCount` incremented by 1.
 * Mutates the pilot object in place so the caller's array reflects the update.
 *
 * @throws {NoCertifiedPilotError} When no candidates survive all filters.
 */
function pickBest(
  allPilots: Pilot[],
  category: CraftCategory,
  crafts: readonly Craft[],
  foWeight: number,
  exclude: ReadonlySet<string>,
  requireCertifications: string[],
): Pilot {
  const candidates = allPilots.filter((p) => {
    if (!p.certifications.includes(category)) return false;
    if (exclude.has(p.identifier)) return false;
    if (requireCertifications.some((c) => !p.certifications.includes(c))) return false;
    return true;
  });

  if (candidates.length === 0) {
    throw noCandidatesError(category, allPilots, requireCertifications);
  }

  candidates.sort((a, b) => {
    const scoreDiff =
      computeWorkloadScore(a, crafts, foWeight) - computeWorkloadScore(b, crafts, foWeight);
    if (scoreDiff !== 0) return scoreDiff;
    return a.selectionCount - b.selectionCount;
  });

  const chosen = candidates[0];
  chosen.selectionCount += 1;
  return chosen;
}

/**
 * Auto-selects the captain for a craft using the SDD pilot selection algorithm.
 *
 * Applies certification, exclusion, and additional-certification filters, then
 * sorts candidates by workload score and selectionCount tie-break. The chosen
 * pilot's `selectionCount` is incremented in place.
 *
 * @throws {NoCertifiedPilotError} When no eligible pilot remains after all filters.
 * @see RULE-SDD-8, RULE-SDD-9, §4.6.4
 */
export function selectCaptain(params: SelectionParams): Pilot {
  const {
    category,
    pilots,
    activeCrafts,
    foWeight,
    exclude = [],
    requireCertifications = [],
  } = params;

  return pickBest(
    pilots,
    category,
    activeCrafts,
    foWeight,
    new Set(exclude),
    requireCertifications,
  );
}

/**
 * Auto-selects first officers for a craft, excluding the already-chosen captain.
 *
 * Uses the same algorithm as {@link selectCaptain} but removes the captain from
 * the candidate pool to enforce RULE-SDD-10 (no pilot can be both captain and FO).
 * Each selected FO has their `selectionCount` incremented in place.
 *
 * @param captain - The already-selected captain; excluded from FO candidates.
 * @param params - Selection parameters. `minFirstOfficers` controls how many to select.
 * @returns Array of selected first officers (empty when `minFirstOfficers` is 0 or absent).
 * @throws {NoCertifiedPilotError} When not enough certified FO candidates exist.
 * @see RULE-SDD-10, §4.6.4
 */
export function selectFirstOfficers(captain: Pilot, params: SelectionParams): Pilot[] {
  const {
    category,
    pilots,
    activeCrafts,
    foWeight,
    exclude = [],
    requireCertifications = [],
    minFirstOfficers = 0,
  } = params;

  if (minFirstOfficers <= 0) return [];

  // Exclude both the captain and any explicitly excluded pilots
  const foExclude = new Set([...exclude, captain.identifier]);
  const selected: Pilot[] = [];
  const pickedIds = new Set<string>();

  for (let i = 0; i < minFirstOfficers; i++) {
    const dynamicExclude = new Set([...foExclude, ...pickedIds]);
    const fo = pickBest(
      pilots,
      category,
      activeCrafts,
      foWeight,
      dynamicExclude,
      requireCertifications,
    );
    selected.push(fo);
    pickedIds.add(fo.identifier);
  }

  return selected;
}
