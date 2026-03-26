import type { BlackBoxEntry } from "@atc/types";
import { BlackBoxEntryType } from "@atc/types";

/**
 * Creates a new black box entry with the current timestamp.
 *
 * Black box entries are the fundamental unit of the append-only craft log.
 * Any pilot (captain, first officer, or jumpseat) may create entries.
 *
 * @param author - Identifier of the pilot recording the entry.
 * @param type - The kind of event being recorded.
 * @param content - Description of the decision, event, or observation.
 * @returns A new BlackBoxEntry with the current timestamp.
 * @see RULE-BBOX-1, RULE-BBOX-3
 */
export function createBlackBoxEntry(
  author: string,
  type: BlackBoxEntryType,
  content: string,
): BlackBoxEntry {
  return {
    timestamp: new Date(),
    author,
    type,
    content,
  };
}

/**
 * Appends an entry to a black box, returning a new array.
 *
 * Enforces the append-only invariant: the original array is never mutated,
 * and all existing entries are preserved in their original order.
 *
 * @param blackBox - The current black box entries.
 * @param entry - The new entry to append.
 * @returns A new readonly array containing all existing entries plus the new one.
 * @see RULE-BBOX-2
 */
export function appendToBlackBox(
  blackBox: readonly BlackBoxEntry[],
  entry: BlackBoxEntry,
): readonly BlackBoxEntry[] {
  return [...blackBox, entry];
}
