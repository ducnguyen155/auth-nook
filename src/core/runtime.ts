import { getPlatform } from '../platform/index.ts';
import { RevealEngine } from './reveal/revealEngine.ts';
import { AutoLockController } from './security/autoLock.ts';
import { ClipboardGuard } from './security/clipboardGuard.ts';
import { VaultService } from './vault/vaultService.ts';

const platform = getPlatform();
export const vaultService = new VaultService(platform);
export const revealEngine = new RevealEngine(vaultService);
export const clipboardGuard = new ClipboardGuard(platform);

export const autoLock = new AutoLockController(async () => {
  if (vaultService.isUnlocked()) {
    await vaultService.lock();
  }
});

export { platform };
