import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { concatBytes, utf8ToBytes, bytesToUtf8 } from './encoding.ts';
import { randomBytes } from './random.ts';

const NONCE_LENGTH = 24;

export class DecryptionError extends Error {
  constructor(message = 'Decryption failed or data was tampered with.') {
    super(message);
    this.name = 'DecryptionError';
  }
}

/**
 * Encrypts plaintext with XChaCha20-Poly1305 and prepends the 24-byte random nonce.
 */
export function seal(key: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array): Uint8Array {
  if (key.length !== 32) {
    throw new Error('AEAD key must be 32 bytes.');
  }
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = xchacha20poly1305(key, nonce, aad);
  const ciphertext = cipher.encrypt(plaintext);
  return concatBytes(nonce, ciphertext);
}

/**
 * Decrypts a sealed payload (`[nonce(24) | ciphertext+tag]`) and verifies AAD.
 */
export function open(key: Uint8Array, sealed: Uint8Array, aad?: Uint8Array): Uint8Array {
  if (key.length !== 32) {
    throw new Error('AEAD key must be 32 bytes.');
  }
  if (sealed.length < NONCE_LENGTH + 16) {
    throw new DecryptionError('Ciphertext is truncated.');
  }
  const nonce = sealed.subarray(0, NONCE_LENGTH);
  const ciphertext = sealed.subarray(NONCE_LENGTH);
  try {
    const cipher = xchacha20poly1305(key, nonce, aad);
    return cipher.decrypt(ciphertext);
  } catch {
    throw new DecryptionError();
  }
}

export function sealJson<T>(key: Uint8Array, value: T, aad?: Uint8Array): Uint8Array {
  return seal(key, utf8ToBytes(JSON.stringify(value)), aad);
}

export function openJson<T>(key: Uint8Array, sealed: Uint8Array, aad?: Uint8Array): T {
  const plain = open(key, sealed, aad);
  try {
    return JSON.parse(bytesToUtf8(plain)) as T;
  } finally {
    zeroize(plain);
  }
}

export function zeroize(...buffers: Array<Uint8Array | null | undefined>): void {
  for (const buf of buffers) {
    if (buf) {
      buf.fill(0);
    }
  }
}
