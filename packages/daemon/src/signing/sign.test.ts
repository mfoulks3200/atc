import { describe, it, expect } from "vitest";
import { signBlackBoxEntry, verifyBlackBoxEntry } from "./sign.js";
import { generateEd25519KeyPair } from "../state/pilot-keystore.js";
import { BlackBoxEntryType } from "@airtrafficcontrol/types";

const ENTRY = {
  timestamp: "2026-04-30T12:00:00.000Z",
  author: "pilot-1",
  type: BlackBoxEntryType.Decision,
  content: "Chose approach A over B",
} as const;

describe("signBlackBoxEntry", () => {
  it("returns a non-empty base64url string", () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const sig = signBlackBoxEntry(privateKey, publicKey, ENTRY);
    expect(typeof sig).toBe("string");
    expect(sig.length).toBeGreaterThan(0);
    // base64url characters only (no +, /, =)
    expect(sig).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces different signatures for different content", () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const sig1 = signBlackBoxEntry(privateKey, publicKey, ENTRY);
    const sig2 = signBlackBoxEntry(privateKey, publicKey, { ...ENTRY, content: "different" });
    expect(sig1).not.toBe(sig2);
  });
});

describe("verifyBlackBoxEntry", () => {
  it("returns true for a valid signature", () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const sig = signBlackBoxEntry(privateKey, publicKey, ENTRY);
    expect(verifyBlackBoxEntry(publicKey, ENTRY, sig)).toBe(true);
  });

  it("returns false when content is tampered after signing", () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const sig = signBlackBoxEntry(privateKey, publicKey, ENTRY);
    const tampered = { ...ENTRY, content: "tampered content" };
    expect(verifyBlackBoxEntry(publicKey, tampered, sig)).toBe(false);
  });

  it("returns false when author is tampered after signing", () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const sig = signBlackBoxEntry(privateKey, publicKey, ENTRY);
    const tampered = { ...ENTRY, author: "evil-pilot" };
    expect(verifyBlackBoxEntry(publicKey, tampered, sig)).toBe(false);
  });

  it("returns false for a different key pair", () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const { publicKey: otherPublicKey } = generateEd25519KeyPair();
    const sig = signBlackBoxEntry(privateKey, publicKey, ENTRY);
    expect(verifyBlackBoxEntry(otherPublicKey, ENTRY, sig)).toBe(false);
  });

  it("returns false for garbage input", () => {
    const { publicKey } = generateEd25519KeyPair();
    expect(verifyBlackBoxEntry(publicKey, ENTRY, "not-a-valid-cose-envelope")).toBe(false);
  });

  it("returns false for empty string", () => {
    const { publicKey } = generateEd25519KeyPair();
    expect(verifyBlackBoxEntry(publicKey, ENTRY, "")).toBe(false);
  });
});
