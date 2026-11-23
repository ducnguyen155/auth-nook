import { randomBytes } from '../../core/crypto/random.ts';
import { DeviceKeyUnavailableError } from '../platform.ts';
import type { DeviceKeyStore } from './types.ts';

/**
 * In-memory DeviceKeyStore for unit tests.
 */
export class MemoryDeviceKeyStore implements DeviceKeyStore {
  private keys = new Map<string, Uint8Array>();

  isSupported(): boolean {
    return true;
  }

  async create(vaultId: string): Promise<Uint8Array> {
    const secret = randomBytes(32);
    this.keys.set(vaultId, new Uint8Array(secret));
    return secret;
  }

  async load(vaultId: string): Promise<Uint8Array> {
    const secret = this.keys.get(vaultId);
    if (!secret) {
      throw new DeviceKeyUnavailableError();
    }
    return new Uint8Array(secret);
  }

  async destroy(vaultId: string): Promise<void> {
    this.keys.delete(vaultId);
  }
}
