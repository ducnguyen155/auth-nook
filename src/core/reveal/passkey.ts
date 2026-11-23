import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base64ToBytes, bytesToBase64, constantTimeEqual, utf8ToBytes } from '../crypto/encoding.ts';
import type { PasskeyRecord } from '../vault/types.ts';

export const PASSKEY_MIN_LENGTH = 4;
export const PASSKEY_MAX_LENGTH = 8;

/**
 * Validates that a Passkey is 4-8 ASCII digits.
 */
export function validatePasskey(passkey: string): void {
  if (!/^\d{4,8}$/.test(passkey)) {
    throw new Error(`Passkey must be ${PASSKEY_MIN_LENGTH} to ${PASSKEY_MAX_LENGTH} digits (0-9).`);
  }
}

function hashPositionChar(passkeyKey: Uint8Array, index: number, char: string): Uint8Array {
  return hmac(sha256, passkeyKey, utf8ToBytes(`${index}:${char}`));
}

/**
 * Builds a PasskeyRecord containing per-position HMAC-SHA256 digests.
 * Plaintext passkey characters are never persisted.
 */
export function buildPasskeyRecord(passkeyKey: Uint8Array, passkey: string): PasskeyRecord {
  validatePasskey(passkey);
  const hashes: string[] = [];
  for (let i = 0; i < passkey.length; i++) {
    hashes.push(bytesToBase64(hashPositionChar(passkeyKey, i, passkey[i])));
  }
  return {
    length: passkey.length,
    hashes,
  };
}

/**
 * Verifies a single character at 0-based `index` in constant time.
 */
export function verifyPasskeyChar(
  passkeyKey: Uint8Array,
  record: PasskeyRecord,
  index: number,
  char: string
): boolean {
  if (!Number.isInteger(index) || index < 0 || index >= record.length) {
    return false;
  }
  if (char.length !== 1) {
    return false;
  }
  const expected = base64ToBytes(record.hashes[index]);
  const actual = hashPositionChar(passkeyKey, index, char);
  return constantTimeEqual(actual, expected);
}
