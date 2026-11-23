import { MemoryPlatform } from './memoryPlatform.ts';
import { NeutralinoPlatform } from './neutralinoPlatform.ts';
import type { Platform } from './platform.ts';

let activePlatform: Platform | null = null;

/**
 * Returns the active Platform singleton (Neutralino in desktop mode,
 * MemoryPlatform fallback when running in a plain browser).
 */
export function getPlatform(): Platform {
  if (activePlatform) return activePlatform;

  const isNeutralino = typeof (globalThis as Record<string, unknown>).NL_PORT !== 'undefined';
  if (isNeutralino) {
    const neu = new NeutralinoPlatform();
    neu.init();
    activePlatform = neu;
  } else {
    activePlatform = new MemoryPlatform();
  }
  return activePlatform;
}

export function setPlatformForTesting(platform: Platform): void {
  activePlatform = platform;
}
