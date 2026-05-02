import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PilotKeystore, generateEd25519KeyPair, computeKeyFingerprint } from "./pilot-keystore.js";

describe("generateEd25519KeyPair", () => {
  it("returns base64url-encoded private and public keys", () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    expect(typeof privateKey).toBe("string");
    expect(typeof publicKey).toBe("string");
    expect(privateKey).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(publicKey).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns 32 raw bytes for each key (base64url of 32 bytes)", () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    expect(Buffer.from(privateKey, "base64url")).toHaveLength(32);
    expect(Buffer.from(publicKey, "base64url")).toHaveLength(32);
  });

  it("returns a different pair each time", () => {
    const pair1 = generateEd25519KeyPair();
    const pair2 = generateEd25519KeyPair();
    expect(pair1.publicKey).not.toBe(pair2.publicKey);
    expect(pair1.privateKey).not.toBe(pair2.privateKey);
  });
});

describe("computeKeyFingerprint", () => {
  it("returns a 64-character lowercase hex string", () => {
    const { publicKey } = generateEd25519KeyPair();
    const fp = computeKeyFingerprint(publicKey);
    expect(fp).toHaveLength(64);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same key", () => {
    const { publicKey } = generateEd25519KeyPair();
    expect(computeKeyFingerprint(publicKey)).toBe(computeKeyFingerprint(publicKey));
  });

  it("differs for different keys", () => {
    const { publicKey: pk1 } = generateEd25519KeyPair();
    const { publicKey: pk2 } = generateEd25519KeyPair();
    expect(computeKeyFingerprint(pk1)).not.toBe(computeKeyFingerprint(pk2));
  });
});

describe("PilotKeystore", () => {
  let stateDir: string;
  let store: PilotKeystore;

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), "atc-keystore-test-"));
    store = new PilotKeystore(stateDir);
  });

  it("returns undefined for an unknown pilot", () => {
    expect(store.get("proj", "unknown")).toBeUndefined();
  });

  it("stores and retrieves a key pair", () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    store.set("proj", "pilot-1", privateKey, publicKey);
    const record = store.get("proj", "pilot-1");
    expect(record).toBeDefined();
    expect(record!.privateKey).toBe(privateKey);
    expect(record!.publicKey).toBe(publicKey);
  });

  it("scopes keys per project", () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    store.set("project-a", "pilot-1", privateKey, publicKey);
    expect(store.get("project-b", "pilot-1")).toBeUndefined();
  });

  it("overwrites an existing key pair on re-set", () => {
    const { privateKey: pk1, publicKey: pub1 } = generateEd25519KeyPair();
    const { privateKey: pk2, publicKey: pub2 } = generateEd25519KeyPair();
    store.set("proj", "pilot-1", pk1, pub1);
    store.set("proj", "pilot-1", pk2, pub2);
    const record = store.get("proj", "pilot-1");
    expect(record!.publicKey).toBe(pub2);
  });

  it("removes a key pair and returns true", () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    store.set("proj", "pilot-1", privateKey, publicKey);
    expect(store.remove("proj", "pilot-1")).toBe(true);
    expect(store.get("proj", "pilot-1")).toBeUndefined();
  });

  it("returns false when removing a nonexistent key", () => {
    expect(store.remove("proj", "nonexistent")).toBe(false);
  });

  it("persists and restores key pairs across save/load", async () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    store.set("proj", "pilot-1", privateKey, publicKey);
    await store.save();

    const store2 = new PilotKeystore(stateDir);
    await store2.load();

    const record = store2.get("proj", "pilot-1");
    expect(record).toBeDefined();
    expect(record!.privateKey).toBe(privateKey);
    expect(record!.publicKey).toBe(publicKey);
  });

  it("handles pilot identifiers containing colons in the compound key", async () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    store.set("proj", "scope:pilot:deep", privateKey, publicKey);
    await store.save();

    const store2 = new PilotKeystore(stateDir);
    await store2.load();
    const record = store2.get("proj", "scope:pilot:deep");
    expect(record!.publicKey).toBe(publicKey);
  });

  it("load is a no-op when the file does not exist", async () => {
    const fresh = new PilotKeystore(stateDir + "-nonexistent");
    await expect(fresh.load()).resolves.toBeUndefined();
  });
});
