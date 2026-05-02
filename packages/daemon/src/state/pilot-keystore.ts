/**
 * Dedicated keystore for Ed25519 private key material.
 *
 * Private keys MUST be stored separately from the craft and pilot entity
 * persistence files (pilots.json, crafts.json). This module owns the only
 * path where key material touches disk.
 *
 * Keys are indexed by a compound `projectName:pilotIdentifier` key and stored
 * in `<stateDir>/pilot-keys.json` as base64url-encoded private key bytes.
 *
 * @see RULE-PILOT-3a — private keys stored in dedicated keystore
 */

import { createHash, generateKeyPairSync } from "node:crypto";
import { join } from "node:path";
import { atomicWriteJson, readJsonSafe } from "./persistence.js";

const KEYS_FILE = "pilot-keys.json";

/**
 * Persisted format for a single key entry.
 */
interface PersistedKeyEntry {
  projectName: string;
  pilotIdentifier: string;
  /** base64url-encoded raw private key bytes (32 bytes for Ed25519). */
  privateKey: string;
  /** base64url-encoded raw public key bytes (32 bytes for Ed25519). */
  publicKey: string;
}

/**
 * In-memory key record, keyed by `projectName:pilotIdentifier`.
 */
interface KeyRecord {
  privateKey: string;
  publicKey: string;
}

/**
 * Computes the SHA-256 fingerprint of a raw public key.
 *
 * The fingerprint follows the same convention as the RULE-BBOX-7 `kid` field:
 * `hex(SHA-256(raw_public_key_bytes))`, lowercase, 64 characters.
 *
 * @param publicKeyBase64url - base64url-encoded raw public key bytes.
 * @returns 64-character lowercase hex string.
 *
 * @see RULE-BBOX-7
 */
export function computeKeyFingerprint(publicKeyBase64url: string): string {
  const raw = Buffer.from(publicKeyBase64url, "base64url");
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Generates a new Ed25519 key pair.
 *
 * @returns `{ privateKey, publicKey }` — both fields are base64url-encoded raw key bytes.
 */
export function generateEd25519KeyPair(): { privateKey: string; publicKey: string } {
  const { privateKey: privKeyObj, publicKey: pubKeyObj } = generateKeyPairSync("ed25519");

  const privateKey = privKeyObj
    .export({ type: "pkcs8", format: "der" })
    .subarray(-32) // last 32 bytes are the raw private key seed
    .toString("base64url");

  const publicKey = pubKeyObj
    .export({ type: "spki", format: "der" })
    .subarray(-32) // last 32 bytes are the raw public key
    .toString("base64url");

  return { privateKey, publicKey };
}

/**
 * Persistent store for Ed25519 private key material.
 *
 * Call `load()` on startup and `save()` after any mutation to persist state.
 *
 * @see RULE-PILOT-3a
 */
export class PilotKeystore {
  private readonly _filePath: string;
  private readonly _keys: Map<string, KeyRecord> = new Map();

  /**
   * @param stateDir - Directory where `pilot-keys.json` is stored.
   */
  constructor(stateDir: string) {
    this._filePath = join(stateDir, KEYS_FILE);
  }

  private _makeKey(projectName: string, pilotIdentifier: string): string {
    return `${projectName}:${pilotIdentifier}`;
  }

  /**
   * Retrieves the key record for a pilot, or `undefined` if none is registered.
   *
   * @param projectName - Project the pilot belongs to.
   * @param pilotIdentifier - Pilot identifier.
   */
  get(projectName: string, pilotIdentifier: string): KeyRecord | undefined {
    return this._keys.get(this._makeKey(projectName, pilotIdentifier));
  }

  /**
   * Stores a key pair for a pilot.
   *
   * @param projectName - Project the pilot belongs to.
   * @param pilotIdentifier - Pilot identifier.
   * @param privateKey - base64url-encoded raw private key bytes.
   * @param publicKey - base64url-encoded raw public key bytes.
   */
  set(projectName: string, pilotIdentifier: string, privateKey: string, publicKey: string): void {
    this._keys.set(this._makeKey(projectName, pilotIdentifier), { privateKey, publicKey });
  }

  /**
   * Removes the key pair for a pilot.
   *
   * @returns `true` if a record was removed, `false` if none existed.
   */
  remove(projectName: string, pilotIdentifier: string): boolean {
    return this._keys.delete(this._makeKey(projectName, pilotIdentifier));
  }

  /**
   * Atomically writes all key records to `stateDir/pilot-keys.json`.
   */
  async save(): Promise<void> {
    const all: PersistedKeyEntry[] = [];
    for (const [compound, record] of this._keys) {
      const [projectName, ...rest] = compound.split(":");
      const pilotIdentifier = rest.join(":");
      all.push({ projectName: projectName!, pilotIdentifier, ...record });
    }
    await atomicWriteJson(this._filePath, all);
  }

  /**
   * Reads key records from `stateDir/pilot-keys.json` into memory.
   *
   * If the file does not exist the store is left empty.
   */
  async load(): Promise<void> {
    const data = await readJsonSafe<PersistedKeyEntry[]>(this._filePath);
    if (data === null) return;
    this._keys.clear();
    for (const { projectName, pilotIdentifier, privateKey, publicKey } of data) {
      this.set(projectName, pilotIdentifier, privateKey, publicKey);
    }
  }
}
