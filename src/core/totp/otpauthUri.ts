import type { TotpAlgorithm } from '../vault/types.ts';
import { isValidBase32Secret, normalizeBase32Secret } from './totp.ts';

export interface ParsedOtpAuthUri {
  issuer: string;
  account: string;
  secret: string;
  digits: 6 | 8;
  period: number;
  algorithm: TotpAlgorithm;
}

/**
 * Parses and validates an `otpauth://totp/...` URI.
 */
export function parseOtpAuthUri(uri: string): ParsedOtpAuthUri {
  let url: URL;
  try {
    url = new URL(uri.trim());
  } catch {
    throw new Error('Invalid otpauth URI.');
  }

  if (url.protocol !== 'otpauth:' || url.host.toLowerCase() !== 'totp') {
    throw new Error('Only otpauth://totp/ URIs are supported.');
  }

  const rawLabel = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  let labelIssuer = '';
  let account = rawLabel;
  const colonIdx = rawLabel.indexOf(':');
  if (colonIdx !== -1) {
    labelIssuer = rawLabel.slice(0, colonIdx).trim();
    account = rawLabel.slice(colonIdx + 1).trim();
  }

  const paramIssuer = url.searchParams.get('issuer')?.trim() ?? '';
  const issuer = paramIssuer || labelIssuer || 'Authenticator';
  if (!account) {
    account = issuer;
  }

  const rawSecret = url.searchParams.get('secret') ?? '';
  const secret = normalizeBase32Secret(rawSecret);
  if (!isValidBase32Secret(secret)) {
    throw new Error('Invalid or missing Base32 secret in URI.');
  }

  const digitsParam = Number(url.searchParams.get('digits') ?? '6');
  if (digitsParam !== 6 && digitsParam !== 8) {
    throw new Error('Only 6 or 8 TOTP digits are supported.');
  }

  const periodParam = Number(url.searchParams.get('period') ?? '30');
  if (!Number.isInteger(periodParam) || periodParam < 5 || periodParam > 120) {
    throw new Error('Invalid TOTP period.');
  }

  const algRaw = (url.searchParams.get('algorithm') ?? 'SHA1').toUpperCase();
  if (algRaw !== 'SHA1' && algRaw !== 'SHA256' && algRaw !== 'SHA512') {
    throw new Error(`Unsupported TOTP algorithm: ${algRaw}`);
  }

  return {
    issuer,
    account,
    secret,
    digits: digitsParam,
    period: periodParam,
    algorithm: algRaw,
  };
}
