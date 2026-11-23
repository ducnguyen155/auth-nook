import type { StaticCodePosition } from '../vault/types.ts';

export interface ComposeOptions {
  staticCode?: string;
  position: StaticCodePosition;
  separator: string;
}

/**
 * Validates an optional static code (1-32 printable non-control characters, no leading/trailing whitespace).
 */
export function validateStaticCode(raw: string): string | undefined {
  if (raw === '') return undefined;
  if (raw !== raw.trim()) {
    throw new Error('Static code cannot have leading or trailing whitespace.');
  }
  if (raw.length > 32) {
    throw new Error('Static code must be 32 characters or fewer.');
  }
  if (/[\r\n\t\x00-\x1f\x7f]/.test(raw)) {
    throw new Error('Static code contains invalid control characters.');
  }
  return raw;
}

export function validateSeparator(raw: string): string {
  if (raw.length > 3) {
    throw new Error('Separator must be 3 characters or fewer.');
  }
  if (/[\r\n\t\x00-\x1f\x7f]/.test(raw)) {
    throw new Error('Separator contains invalid control characters.');
  }
  return raw;
}

/**
 * Combines a static code with a generated OTP according to position and separator.
 * Example: composeCode("123456", { staticCode: "AAA", position: "prefix", separator: "" }) => "AAA123456".
 */
export function composeCode(otp: string, options: ComposeOptions): string {
  if (!options.staticCode) {
    return otp;
  }
  return options.position === 'prefix'
    ? `${options.staticCode}${options.separator}${otp}`
    : `${otp}${options.separator}${options.staticCode}`;
}
