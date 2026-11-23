import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { open, seal, zeroize } from './aead.ts';
import { concatBytes, utf8ToBytes } from './encoding.ts';

const INFO_KEK = utf8ToBytes('authnook/kek/v1');
const INFO_PASSKEY = utf8ToBytes('authnook/passkey/v1');
const INFO_SECRET = utf8ToBytes('authnook/secret/v1');
const AAD_WRAP_DEK = utf8ToBytes('authnook/dek-wrap/v1');

/**
 * Derives the Key Encryption Key (KEK) from the Argon2id password key
 * and an optional 32-byte Device Secret.
 */
export function deriveKek(passwordKey: Uint8Array, deviceSecret?: Uint8Array): Uint8Array {
  const ikm = deviceSecret ? concatBytes(passwordKey, deviceSecret) : passwordKey;
  try {
    return hkdf(sha256, ikm, undefined, INFO_KEK, 32);
  } finally {
    if (deviceSecret) {
      zeroize(ikm);
    }
  }
}

export function derivePasskeyKey(dek: Uint8Array): Uint8Array {
  return hkdf(sha256, dek, undefined, INFO_PASSKEY, 32);
}

export function deriveSecretFieldKey(dek: Uint8Array): Uint8Array {
  return hkdf(sha256, dek, undefined, INFO_SECRET, 32);
}

export function wrapDek(kek: Uint8Array, dek: Uint8Array): Uint8Array {
  return seal(kek, dek, AAD_WRAP_DEK);
}

export function unwrapDek(kek: Uint8Array, wrappedDek: Uint8Array): Uint8Array {
  return open(kek, wrappedDek, AAD_WRAP_DEK);
}
