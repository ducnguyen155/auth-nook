import { describe, expect, it } from 'vitest';
import { composeCode, validateSeparator, validateStaticCode } from '../totp/composeCode.ts';
import { parseOtpAuthUri } from '../totp/otpauthUri.ts';
import { effectiveEpochForCopy, generateTotpCode, maskOneOtpDigit } from '../totp/totp.ts';

describe('TOTP, otpauth URI, and Static Code Composition', () => {
  it('matches RFC 6238 SHA1 test vector (secret "12345678901234567890" = GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ)', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    // At epoch 59s, RFC 6238 8-digit SHA1 value is 94287082 -> last 6 digits: 287082
    expect(
      generateTotpCode({ secret, digits: 8, period: 30, algorithm: 'SHA1', epochSeconds: 59 })
    ).toBe('94287082');
    expect(
      generateTotpCode({ secret, digits: 6, period: 30, algorithm: 'SHA1', epochSeconds: 59 })
    ).toBe('287082');
  });

  it('parses valid otpauth://totp/ URIs and rejects invalid ones', () => {
    const parsed = parseOtpAuthUri(
      'otpauth://totp/GitHub:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=6&period=30&algorithm=SHA1'
    );
    expect(parsed).toEqual({
      issuer: 'GitHub',
      account: 'alice@example.com',
      secret: 'JBSWY3DPEHPK3PXP',
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
    });

    expect(() => parseOtpAuthUri('https://example.com')).toThrow();
    expect(() => parseOtpAuthUri('otpauth://hotp/Test?secret=JBSWY3DPEHPK3PXP')).toThrow();
    expect(() => parseOtpAuthUri('otpauth://totp/Test?secret=INVALID!')).toThrow();
  });

  it('composes static code with OTP in prefix, suffix, and separator modes', () => {
    expect(composeCode('123456', { position: 'prefix', separator: '' })).toBe('123456');
    expect(composeCode('123456', { staticCode: 'AAA', position: 'prefix', separator: '' })).toBe(
      'AAA123456'
    );
    expect(composeCode('123456', { staticCode: 'AAA', position: 'suffix', separator: '' })).toBe(
      '123456AAA'
    );
    expect(composeCode('123456', { staticCode: 'AAA', position: 'prefix', separator: '-' })).toBe(
      'AAA-123456'
    );

    expect(validateStaticCode('')).toBeUndefined();
    expect(validateStaticCode('AAA')).toBe('AAA');
    expect(() => validateStaticCode(' AAA')).toThrow();
    expect(() => validateStaticCode('A\nB')).toThrow();
    expect(() => validateSeparator('----')).toThrow();
  });

  it('advances to next TOTP period when <= 3s remain before expiry', () => {
    // At 28s into a 30s period, 2s remain -> should return 30
    expect(effectiveEpochForCopy(30, 28_000)).toBe(30);
    // At 20s into a 30s period, 10s remain -> should return 20
    expect(effectiveEpochForCopy(30, 20_000)).toBe(20);
  });

  it('masks exactly 1 digit of an OTP code', () => {
    const masked = maskOneOtpDigit('123456', 'item-abc', 30, 60_000);
    expect(masked).toHaveLength(6);
    expect((masked.match(/•/g) ?? []).length).toBe(1);
  });
});
