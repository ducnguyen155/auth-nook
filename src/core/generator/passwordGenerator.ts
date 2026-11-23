import { randomInt } from '../crypto/random.ts';

export interface GeneratorOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

export const DEFAULT_GENERATOR_OPTIONS: GeneratorOptions = {
  length: 16,
  uppercase: true,
  lowercase: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: false,
};

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?';
const AMBIGUOUS = new Set(['0', 'O', 'o', '1', 'l', 'I', '|']);

function filterAmbiguous(chars: string, exclude: boolean): string {
  if (!exclude) return chars;
  return Array.from(chars)
    .filter((c) => !AMBIGUOUS.has(c))
    .join('');
}

/**
 * Generates a cryptographically random password guaranteeing at least one
 * character from every selected character class, shuffled via Fisher-Yates.
 */
export function generatePassword(options: GeneratorOptions): string {
  const length = Math.max(8, Math.min(64, Math.floor(options.length)));
  const pools: string[] = [];

  if (options.uppercase) pools.push(filterAmbiguous(UPPER, options.excludeAmbiguous));
  if (options.lowercase) pools.push(filterAmbiguous(LOWER, options.excludeAmbiguous));
  if (options.digits) pools.push(filterAmbiguous(DIGITS, options.excludeAmbiguous));
  if (options.symbols) pools.push(filterAmbiguous(SYMBOLS, options.excludeAmbiguous));

  if (pools.length === 0) {
    throw new Error('Select at least one character group.');
  }

  const combined = pools.join('');
  const chars: string[] = [];

  for (const pool of pools) {
    chars.push(pool[randomInt(pool.length)]);
  }
  while (chars.length < length) {
    chars.push(combined[randomInt(combined.length)]);
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }

  return chars.join('');
}

export function estimateEntropyBits(options: GeneratorOptions): number {
  let poolSize = 0;
  if (options.uppercase) poolSize += filterAmbiguous(UPPER, options.excludeAmbiguous).length;
  if (options.lowercase) poolSize += filterAmbiguous(LOWER, options.excludeAmbiguous).length;
  if (options.digits) poolSize += filterAmbiguous(DIGITS, options.excludeAmbiguous).length;
  if (options.symbols) poolSize += filterAmbiguous(SYMBOLS, options.excludeAmbiguous).length;
  if (poolSize <= 1) return 0;
  return Math.round(options.length * Math.log2(poolSize));
}
