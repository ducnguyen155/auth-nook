/**
 * Cryptographically secure random bytes via Web Crypto CSPRNG.
 */
export function randomBytes(length: number): Uint8Array {
  if (length < 0 || !Number.isInteger(length)) {
    throw new RangeError('length must be a non-negative integer');
  }
  const out = new Uint8Array(length);
  if (length > 0) {
    globalThis.crypto.getRandomValues(out);
  }
  return out;
}

/**
 * Unbiased random integer in [0, max) using rejection sampling.
 */
export function randomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0) {
    throw new RangeError('max must be a positive integer');
  }
  if (max === 1) return 0;

  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  while (true) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) {
      return buf[0] % max;
    }
  }
}

export function randomUuid(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
