/**
 * COSE_Sign1 production and verification for Black Box entries.
 *
 * Implements the signing and verification side of RULE-BBOX-7 using:
 * - CBOR serialization via `cbor-x` (required by spec)
 * - Ed25519 via Node.js `node:crypto`
 *
 * The COSE_Sign1 structure (RFC 9052 §4.2) is:
 *   [protected_header_bstr, unprotected_header_map, payload_bstr, signature_bstr]
 *
 * Protected header (CBOR map → bstr):
 *   { 1: -8, 4: <kid_hex_utf8>, 6: <iat_int>, -65537: <author_str>, -65538: <type_str> }
 *   Where:
 *     1  = alg, -8 = EdDSA/Ed25519
 *     4  = kid, value is hex(SHA-256(raw_public_key_bytes))
 *     6  = iat, Unix epoch seconds from entry.timestamp
 *    -65537 = ATC-entry-author (COSE private label)
 *    -65538 = ATC-entry-type (COSE private label)
 *
 * Sig_Structure (the bytes that are signed):
 *   ["Signature1", protected_header_bstr, b"", payload_bstr]
 *
 * @see RULE-BBOX-7
 */

import { sign, verify, createPrivateKey, createPublicKey, createHash } from "node:crypto";
import { encode as cborEncode, decode as cborDecode } from "cbor-x";
import type { BlackBoxEntry } from "../types.js";

// COSE algorithm identifier for EdDSA/Ed25519
const ALG_EDDSA = -8;
// COSE header label for algorithm
const LABEL_ALG = 1;
// COSE header label for key ID
const LABEL_KID = 4;
// COSE header label for issued-at (iat)
const LABEL_IAT = 6;
// ATC private COSE labels
const LABEL_ATC_AUTHOR = -65537;
const LABEL_ATC_TYPE = -65538;

/**
 * Builds the CBOR-encoded protected header for a black box entry.
 */
function buildProtectedHeader(
  kidHex: string,
  iatSeconds: number,
  author: string,
  entryType: string,
): Buffer {
  const headerMap = new Map<number, unknown>([
    [LABEL_ALG, ALG_EDDSA],
    [LABEL_KID, kidHex],
    [LABEL_IAT, iatSeconds],
    [LABEL_ATC_AUTHOR, author],
    [LABEL_ATC_TYPE, entryType],
  ]);
  return Buffer.from(cborEncode(headerMap));
}

/**
 * Builds the Sig_Structure bytes that are passed to Ed25519 signing.
 *
 * Sig_Structure = ["Signature1", protected_header_bstr, external_aad_bstr, payload_bstr]
 */
function buildSigStructure(protectedHeaderBytes: Buffer, payloadBytes: Buffer): Buffer {
  const sigStructure = ["Signature1", protectedHeaderBytes, Buffer.alloc(0), payloadBytes];
  return Buffer.from(cborEncode(sigStructure));
}

/**
 * Produces a COSE_Sign1 envelope for a black box entry.
 *
 * @param privateKeyBase64url - base64url-encoded raw Ed25519 private key seed (32 bytes).
 * @param publicKeyBase64url - base64url-encoded raw Ed25519 public key (32 bytes).
 * @param entry - The black box entry to sign.
 * @returns Base64url-encoded COSE_Sign1 CBOR structure.
 *
 * @see RULE-BBOX-7
 */
export function signBlackBoxEntry(
  privateKeyBase64url: string,
  publicKeyBase64url: string,
  entry: Pick<BlackBoxEntry, "timestamp" | "author" | "type" | "content">,
): string {
  const rawPublicKey = Buffer.from(publicKeyBase64url, "base64url");
  const kidHex = createHash("sha256").update(rawPublicKey).digest("hex");
  const iatSeconds = Math.floor(new Date(entry.timestamp).getTime() / 1000);

  const protectedHeaderBytes = buildProtectedHeader(
    kidHex,
    iatSeconds,
    entry.author,
    String(entry.type),
  );
  const payloadBytes = Buffer.from(entry.content, "utf8");
  const sigStructureBytes = buildSigStructure(protectedHeaderBytes, payloadBytes);

  // Reconstruct a DER-encoded PKCS8 private key from the raw seed bytes.
  // Node's createPrivateKey accepts 'jwk' format for Ed25519.
  const rawPrivateKey = Buffer.from(privateKeyBase64url, "base64url");
  const privateKeyObj = createPrivateKey({
    key: {
      kty: "OKP",
      crv: "Ed25519",
      d: rawPrivateKey.toString("base64url"),
      x: publicKeyBase64url,
    },
    format: "jwk",
  });

  // Ed25519 is PureEdDSA — pass null for algorithm (no separate digest step).
  const signatureBytes = sign(null, sigStructureBytes, privateKeyObj);

  // COSE_Sign1: [protected_bstr, unprotected_map, payload_bstr, signature_bstr]
  const coseSign1 = [protectedHeaderBytes, new Map(), payloadBytes, signatureBytes];
  return Buffer.from(cborEncode(coseSign1)).toString("base64url");
}

/**
 * Verifies a COSE_Sign1 envelope against a pilot's public key.
 *
 * @param publicKeyBase64url - base64url-encoded raw Ed25519 public key (32 bytes).
 * @param entry - The black box entry the signature was produced for.
 * @param signatureBase64url - Base64url-encoded COSE_Sign1 envelope.
 * @returns `true` if the signature is valid, `false` otherwise.
 *
 * @see RULE-BBOX-8
 */
export function verifyBlackBoxEntry(
  publicKeyBase64url: string,
  entry: Pick<BlackBoxEntry, "timestamp" | "author" | "type" | "content">,
  signatureBase64url: string,
): boolean {
  try {
    const cborBytes = Buffer.from(signatureBase64url, "base64url");
    const coseSign1 = cborDecode(cborBytes) as unknown[];

    if (!Array.isArray(coseSign1) || coseSign1.length !== 4) return false;

    const signatureBytes = coseSign1[3];
    if (!(signatureBytes instanceof Uint8Array)) return false;

    // Rebuild the Sig_Structure from the current entry fields rather than
    // from the decoded COSE payload. This ensures that any tampering with
    // content, author, type, or timestamp causes verification to fail.
    const rawPublicKey = Buffer.from(publicKeyBase64url, "base64url");
    const kidHex = createHash("sha256").update(rawPublicKey).digest("hex");
    const iatSeconds = Math.floor(new Date(entry.timestamp).getTime() / 1000);
    const protectedHeaderBytes = buildProtectedHeader(
      kidHex,
      iatSeconds,
      entry.author,
      String(entry.type),
    );
    const payloadBytes = Buffer.from(entry.content, "utf8");
    const sigStructureBytes = buildSigStructure(protectedHeaderBytes, payloadBytes);

    const publicKeyObj = createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: rawPublicKey.toString("base64url") },
      format: "jwk",
    });

    // Ed25519 is PureEdDSA — pass null for algorithm (no separate digest step).
    return verify(null, sigStructureBytes, publicKeyObj, Buffer.from(signatureBytes));
  } catch {
    return false;
  }
}
