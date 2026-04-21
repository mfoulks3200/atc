import { CallsignConflictError } from "@airtrafficcontrol/errors";

/**
 * Converts a spec title into a URL-safe slug.
 *
 * Lowercases the input, replaces spaces and non-alphanumeric characters with
 * hyphens, collapses consecutive hyphens, trims leading/trailing hyphens, and
 * truncates to 40 characters at a word boundary.
 *
 * @see RULE-SDD-5
 */
export function slugifyTitle(title: string): string {
  let slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (slug.length <= 40) {
    return slug;
  }

  // Truncate at word boundary: find last hyphen at or before position 40
  const truncated = slug.slice(0, 40);
  const lastHyphen = truncated.lastIndexOf("-");
  if (lastHyphen <= 0) {
    // No word boundary found; return the full 40-char slice
    return truncated;
  }
  return truncated.slice(0, lastHyphen);
}

/**
 * Result of a callsign generation attempt.
 */
export interface CallsignResult {
  /** The generated callsign. */
  callsign: string;
  /** The counter value to persist — caller is responsible for storage. */
  nextCounter: number;
}

/**
 * Generates a unique callsign from a spec title and a monotonic counter.
 *
 * Appends a zero-padded counter (`01`–`99`, then `100+`) to the slugified
 * title. If the result collides with an existing callsign, increments the
 * counter and retries up to 100 times before throwing {@link CallsignConflictError}.
 *
 * Counter persistence is the caller's responsibility — the returned
 * `nextCounter` value must be saved to the project config store before the
 * branch creation step (see §4.6.1 step 7). In dry-run mode it must NOT be
 * persisted.
 *
 * @param title - Raw spec title; slugified internally.
 * @param counter - Starting counter value (1-based monotonic).
 * @param existingCallsigns - Set of callsigns already in use in the project.
 * @returns The generated callsign and the next counter value.
 * @throws {CallsignConflictError} When 100 consecutive counter values all collide.
 * @see RULE-SDD-5, §4.6.2
 */
export function generateCallsign(
  title: string,
  counter: number,
  existingCallsigns: readonly string[],
): CallsignResult {
  const slug = slugifyTitle(title);
  const existing = new Set(existingCallsigns);

  for (let attempt = 0; attempt < 100; attempt++) {
    const current = counter + attempt;
    const suffix = current < 100 ? String(current).padStart(2, "0") : String(current);
    const callsign = `${slug}-${suffix}`;

    if (!existing.has(callsign)) {
      return { callsign, nextCounter: current + 1 };
    }
  }

  throw new CallsignConflictError(
    `Unable to generate a unique callsign for "${title}" after 100 attempts — all counters from ${counter} to ${counter + 99} are taken.`,
  );
}
