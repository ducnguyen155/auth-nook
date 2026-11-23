import { randomBytes } from '../../core/crypto/random.ts';
import { DeviceKeyUnavailableError, type Platform } from '../platform.ts';
import type { DeviceKeyStore } from './types.ts';

const SERVICE_NAME = 'app.authnook.desktop';
const UUID_PATTERN = /^[0-9a-f-]{8,64}$/i;

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

function accountFor(vaultId: string): string {
  if (!UUID_PATTERN.test(vaultId)) {
    throw new Error('Invalid vaultId for Keychain lookup.');
  }
  return `device-${vaultId}`;
}

/**
 * macOS device-binding store backed by the login Keychain via /usr/bin/security.
 * Secrets are passed via stdin in interactive mode (`security -i`) so they never appear in argv.
 */
export class MacKeychainStore implements DeviceKeyStore {
  private readonly platform: Platform;

  constructor(platform: Platform) {
    this.platform = platform;
  }

  isSupported(): boolean {
    return this.platform.os === 'mac';
  }

  async create(vaultId: string): Promise<Uint8Array> {
    const account = accountFor(vaultId);
    const secret = randomBytes(32);
    const b64 = toBase64(secret);
    const script = `add-generic-password -U -s ${SERVICE_NAME} -a ${account} -w ${b64}\nquit\n`;

    const res = await this.platform.spawn('/usr/bin/security', ['-i'], script);
    if (res.exitCode !== 0) {
      throw new Error(`macOS Keychain write failed (exit code ${res.exitCode})`);
    }
    return secret;
  }

  async load(vaultId: string): Promise<Uint8Array> {
    const account = accountFor(vaultId);
    const res = await this.platform.spawn('/usr/bin/security', [
      'find-generic-password',
      '-s',
      SERVICE_NAME,
      '-a',
      account,
      '-w',
    ]);
    if (res.exitCode !== 0 || !res.stdout.trim()) {
      throw new DeviceKeyUnavailableError('Device key not found in macOS Keychain.');
    }
    return fromBase64(res.stdout);
  }

  async destroy(vaultId: string): Promise<void> {
    const account = accountFor(vaultId);
    await this.platform.spawn('/usr/bin/security', [
      'delete-generic-password',
      '-s',
      SERVICE_NAME,
      '-a',
      account,
    ]);
  }
}
