import { argon2id } from 'hash-wasm';

export interface KdfParams {
  algorithm: 'argon2id';
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  hashLength: number;
}

export const DEFAULT_KDF_PARAMS: KdfParams = {
  algorithm: 'argon2id',
  memoryKiB: 65536, // 64 MiB
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
};

/**
 * Validates Argon2id KDF parameters against safe upper/lower bounds to prevent
 * untrusted backup or database metadata from triggering memory/CPU exhaustion.
 */
export function validateKdfParams(raw: unknown): KdfParams {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid or unsupported KDF parameters.');
  }
  const { algorithm, memoryKiB, iterations, parallelism, hashLength } = raw as Record<
    string,
    unknown
  >;
  if (
    algorithm !== 'argon2id' ||
    hashLength !== 32 ||
    typeof memoryKiB !== 'number' ||
    !Number.isInteger(memoryKiB) ||
    memoryKiB < 1024 ||
    memoryKiB > 524288 ||
    typeof iterations !== 'number' ||
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    iterations > 32 ||
    typeof parallelism !== 'number' ||
    !Number.isInteger(parallelism) ||
    parallelism < 1 ||
    parallelism > 16
  ) {
    throw new Error('Invalid or unsupported KDF parameters.');
  }
  return {
    algorithm: 'argon2id',
    memoryKiB,
    iterations,
    parallelism,
    hashLength: 32,
  };
}

/**
 * Derives a 32-byte key from a password and salt using Argon2id (WASM).
 */
export async function derivePasswordKey(
  password: string,
  salt: Uint8Array,
  params: KdfParams = DEFAULT_KDF_PARAMS
): Promise<Uint8Array> {
  const validParams = validateKdfParams(params);
  if (salt.length < 16) {
    throw new Error('KDF salt must be at least 16 bytes.');
  }
  return argon2id({
    password,
    salt,
    parallelism: validParams.parallelism,
    iterations: validParams.iterations,
    memorySize: validParams.memoryKiB,
    hashLength: validParams.hashLength,
    outputType: 'binary',
  });
}
