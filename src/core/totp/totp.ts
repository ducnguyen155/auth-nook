import { createGuardrails, generateSync } from 'otplib';
import type { TotpAlgorithm } from '../vault/types.ts';

const relaxedGuardrails = createGuardrails({
  MIN_SECRET_BYTES: 1,
});

export interface TotpGenerateInput {
  secret: string;
  digits?: 6 | 8;
  period?: number;
  algorithm?: TotpAlgorithm;
  epochSeconds?: number;
}

function toOtplibAlgorithm(alg: TotpAlgorithm): 'sha1' | 'sha256' | 'sha512' {
  if (alg === 'SHA256') return 'sha256';
  if (alg === 'SHA512') return 'sha512';
  return 'sha1';
}

export function normalizeBase32Secret(raw: string): string {
  return raw.replace(/[\s-]+/g, '').toUpperCase();
}

export function isValidBase32Secret(raw: string): boolean {
  const normalized = normalizeBase32Secret(raw);
  return /^[A-Z2-7]+=*$/.test(normalized) && normalized.replace(/=+$/, '').length >= 8;
}

/**
 * Generates a TOTP code using otplib. Supports 6/8 digits, SHA1/SHA256/SHA512,
 * and standard 80-bit+ Base32 secrets.
 */
export function generateTotpCode(input: TotpGenerateInput): string {
  const secret = normalizeBase32Secret(input.secret);
  const digits = input.digits ?? 6;
  const period = input.period ?? 30;
  const algorithm = toOtplibAlgorithm(input.algorithm ?? 'SHA1');

  return generateSync({
    secret,
    digits,
    period,
    algorithm,
    epoch: input.epochSeconds ?? Math.floor(Date.now() / 1000),
    guardrails: relaxedGuardrails,
  });
}

export function remainingSeconds(period = 30, nowMs = Date.now()): number {
  const elapsed = Math.floor(nowMs / 1000) % period;
  return period - elapsed;
}

/**
 * Returns the epoch second to use when copying an OTP.
 * If <= 3s remain in the current period, returns the next period's start so
 * the copied code remains valid long enough to paste.
 */
export function effectiveEpochForCopy(period = 30, nowMs = Date.now()): number {
  const nowSec = Math.floor(nowMs / 1000);
  const rem = remainingSeconds(period, nowMs);
  return rem <= 3 ? nowSec + rem : nowSec;
}

/**
 * Masks exactly one digit of an OTP code (using a deterministic index per item & period)
 * so 5 of 6 digits remain visible while still hiding the complete code.
 */
export function maskOneOtpDigit(otp: string, itemId: string, period = 30, nowMs = Date.now()): string {
  if (otp.length === 0) return otp;
  const step = Math.floor(nowMs / 1000 / period);
  let hash = step;
  for (let i = 0; i < itemId.length; i++) {
    hash = (hash * 31 + itemId.charCodeAt(i)) >>> 0;
  }
  const maskIdx = hash % otp.length;
  return `${otp.slice(0, maskIdx)}•${otp.slice(maskIdx + 1)}`;
}
