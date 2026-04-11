/**
 * Pure geometry + hashing helpers for the Flight Radar hero widget.
 * No React, no DOM — everything here is unit-testable in isolation.
 *
 * @see docs/superpowers/specs/2026-04-11-flight-radar-hero-design.md
 */

/**
 * 32-bit FNV-1a hash of a string. Used as the deterministic seed for
 * every per-craft bearing and jitter decision so a craft's radar position
 * is stable across renders and across operators viewing the same state.
 */
export function fnv1a(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Multiply by FNV prime 16777619 using Math.imul for 32-bit semantics,
    // then coerce back to unsigned 32-bit.
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Deterministic bearing in [0, 360) for a callsign.
 * This is NOT a real compass heading — it is a pseudo-random but stable
 * angle used purely as a layout hint for the radar.
 */
export function bearingFor(callsign: string): number {
  return fnv1a(`${callsign}:bearing`) % 360;
}

/**
 * Deterministic per-vector angular jitter in degrees in [-5, 5].
 * Lets successive vectors on one craft wobble slightly so tracks don't
 * collapse onto a perfect straight radial line.
 */
export function jitterFor(callsign: string, vectorIndex: number): number {
  const h = fnv1a(`jitter:${callsign}:${vectorIndex}`);
  // Map 32-bit hash into [0, 10), subtract 5 → [-5, 5).
  return (h % 10000) / 1000 - 5;
}
