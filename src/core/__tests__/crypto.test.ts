import { describe, expect, it } from 'vitest';
import { open, seal } from '../crypto/aead.ts';
import { bytesToHex, utf8ToBytes } from '../crypto/encoding.ts';
import { derivePasswordKey, validateKdfParams } from '../crypto/kdf.ts';
import { deriveKek, unwrapDek, wrapDek } from '../crypto/keys.ts';
import { randomBytes } from '../crypto/random.ts';

const TEST_KDF = {
  algorithm: 'argon2id' as const,
  memoryKiB: 1024,
  iterations: 1,
  parallelism: 1,
  hashLength: 32,
};

describe('crypto: AEAD, KDF, and Key Hierarchy', () => {
  it('seals and opens data with matching key and AAD', () => {
    const key = randomBytes(32);
    const aad = utf8ToBytes('authnook/test/aad');
    const pt = utf8ToBytes('super-secret-payload');

    const ct = seal(key, pt, aad);
    const dec = open(key, ct, aad);
    expect(dec).toEqual(pt);
  });

  it('rejects tampered ciphertext, wrong AAD, or wrong key', () => {
    const key = randomBytes(32);
    const otherKey = randomBytes(32);
    const aad = utf8ToBytes('aad-1');
    const pt = utf8ToBytes('hello');

    const ct = seal(key, pt, aad);
    const tampered = new Uint8Array(ct);
    tampered[tampered.length - 1] ^= 0xff;

    expect(() => open(key, tampered, aad)).toThrow();
    expect(() => open(key, ct, utf8ToBytes('aad-2'))).toThrow();
    expect(() => open(otherKey, ct, aad)).toThrow();
  });

  it('produces unique nonces on repeated seal calls', () => {
    const key = randomBytes(32);
    const pt = utf8ToBytes('same');
    const c1 = seal(key, pt);
    const c2 = seal(key, pt);
    expect(bytesToHex(c1.subarray(0, 24))).not.toBe(bytesToHex(c2.subarray(0, 24)));
  });

  it('derives deterministic Argon2id keys and distinct KEKs with DeviceSecret', async () => {
    const salt1 = randomBytes(16);
    const salt2 = randomBytes(16);

    const k1 = await derivePasswordKey('master-pw-123', salt1, TEST_KDF);
    const k1b = await derivePasswordKey('master-pw-123', salt1, TEST_KDF);
    const k2 = await derivePasswordKey('master-pw-123', salt2, TEST_KDF);

    expect(bytesToHex(k1)).toBe(bytesToHex(k1b));
    expect(bytesToHex(k1)).not.toBe(bytesToHex(k2));

    const ds1 = randomBytes(32);
    const ds2 = randomBytes(32);
    const kekNoDs = deriveKek(k1);
    const kekDs1 = deriveKek(k1, ds1);
    const kekDs2 = deriveKek(k1, ds2);

    expect(bytesToHex(kekNoDs)).not.toBe(bytesToHex(kekDs1));
    expect(bytesToHex(kekDs1)).not.toBe(bytesToHex(kekDs2));

    const dek = randomBytes(32);
    const wrapped = wrapDek(kekDs1, dek);
    expect(unwrapDek(kekDs1, wrapped)).toEqual(dek);
    expect(() => unwrapDek(kekDs2, wrapped)).toThrow();
  });

  it('rejects out-of-range or unsupported KDF parameters', () => {
    expect(validateKdfParams(TEST_KDF)).toEqual(TEST_KDF);
    expect(() => validateKdfParams(null)).toThrow();
    expect(() => validateKdfParams({ ...TEST_KDF, algorithm: 'pbkdf2' })).toThrow();
    expect(() => validateKdfParams({ ...TEST_KDF, hashLength: 16 })).toThrow();
    expect(() => validateKdfParams({ ...TEST_KDF, memoryKiB: 512 })).toThrow();
    expect(() => validateKdfParams({ ...TEST_KDF, memoryKiB: 1_048_576 })).toThrow();
    expect(() => validateKdfParams({ ...TEST_KDF, iterations: 0 })).toThrow();
    expect(() => validateKdfParams({ ...TEST_KDF, iterations: 100 })).toThrow();
    expect(() => validateKdfParams({ ...TEST_KDF, parallelism: 0 })).toThrow();
    expect(() => validateKdfParams({ ...TEST_KDF, parallelism: 32 })).toThrow();
  });
});
