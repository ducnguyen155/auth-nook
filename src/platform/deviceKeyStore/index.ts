import type { Platform } from '../platform.ts';
import { MacKeychainStore } from './macKeychainStore.ts';
import { MemoryDeviceKeyStore } from './memoryStore.ts';
import type { DeviceKeyStore } from './types.ts';
import { WindowsDpapiStore } from './windowsDpapiStore.ts';

export type { DeviceKeyStore } from './types.ts';
export { WindowsDpapiStore } from './windowsDpapiStore.ts';
export { MacKeychainStore } from './macKeychainStore.ts';
export { MemoryDeviceKeyStore } from './memoryStore.ts';

export function createDeviceKeyStore(platform: Platform): DeviceKeyStore {
  if (!platform.isDesktop) {
    return new MemoryDeviceKeyStore();
  }
  if (platform.os === 'windows') {
    return new WindowsDpapiStore(platform);
  }
  if (platform.os === 'mac') {
    return new MacKeychainStore(platform);
  }
  return {
    isSupported: () => false,
    create: async () => {
      throw new Error('Device binding is not supported on this OS.');
    },
    load: async () => {
      throw new Error('Device binding is not supported on this OS.');
    },
    destroy: async () => undefined,
  };
}
