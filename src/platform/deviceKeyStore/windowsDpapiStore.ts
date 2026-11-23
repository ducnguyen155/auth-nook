import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '../../core/crypto/encoding.ts';
import { randomBytes } from '../../core/crypto/random.ts';
import { DeviceKeyUnavailableError, HelperIntegrityError, type Platform } from '../platform.ts';
import { WINDOWS_DPAPI_HELPER_SHA256 } from '../../generated/helperHash.ts';
import type { DeviceKeyStore } from './types.ts';

function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes('\\') ? '\\' : '/';
  return [base.replace(/[\\/]+$/, ''), ...parts.map((p) => p.replace(/^[\\/]+|[\\/]+$/g, ''))]
    .filter(Boolean)
    .join(sep);
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/**
 * Windows device-binding store backed by authnook-dpapi.exe (DPAPI CurrentUser).
 * Verifies the helper executable's SHA-256 hash before every invocation.
 */
export class WindowsDpapiStore implements DeviceKeyStore {
  private readonly platform: Platform;

  constructor(platform: Platform) {
    this.platform = platform;
  }

  isSupported(): boolean {
    return this.platform.os === 'windows';
  }

  private async resolveVerifiedHelper(): Promise<string> {
    const baseDir = await this.platform.appBaseDir();
    const helperPath = joinPath(baseDir, 'bin', 'authnook-dpapi.exe');
    if (!(await this.platform.exists(helperPath))) {
      throw new HelperIntegrityError(`Missing DPAPI helper at ${helperPath}`);
    }
    const exeBytes = await this.platform.readFile(helperPath);
    const actualHash = bytesToHex(sha256(exeBytes));
    if (actualHash !== WINDOWS_DPAPI_HELPER_SHA256.toLowerCase()) {
      throw new HelperIntegrityError('DPAPI helper SHA-256 mismatch.');
    }
    return helperPath;
  }

  private async keyFilePath(): Promise<string> {
    const dir = await this.platform.appDataDir();
    return joinPath(dir, 'device.key');
  }

  async create(_vaultId: string): Promise<Uint8Array> {
    const helper = await this.resolveVerifiedHelper();
    const secret = randomBytes(32);
    const res = await this.platform.spawn(helper, ['protect'], `${toBase64(secret)}\n`);
    if (res.exitCode !== 0 || !res.stdout.trim()) {
      throw new Error(`DPAPI protect failed (exit code ${res.exitCode})`);
    }
    const blob = fromBase64(res.stdout);
    await this.platform.writeFileAtomic(await this.keyFilePath(), blob);
    return secret;
  }

  async load(_vaultId: string): Promise<Uint8Array> {
    const keyPath = await this.keyFilePath();
    if (!(await this.platform.exists(keyPath))) {
      throw new DeviceKeyUnavailableError('Device key file is missing.');
    }
    const helper = await this.resolveVerifiedHelper();
    const blob = await this.platform.readFile(keyPath);
    const res = await this.platform.spawn(helper, ['unprotect'], `${toBase64(blob)}\n`);
    if (res.exitCode === 3) {
      throw new DeviceKeyUnavailableError();
    }
    if (res.exitCode !== 0 || !res.stdout.trim()) {
      throw new DeviceKeyUnavailableError(`DPAPI unprotect failed (exit code ${res.exitCode})`);
    }
    return fromBase64(res.stdout);
  }

  async destroy(_vaultId: string): Promise<void> {
    await this.platform.remove(await this.keyFilePath());
  }
}
