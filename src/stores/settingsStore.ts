import { create } from 'zustand';
import { autoLock, vaultService } from '../core/runtime.ts';
import { DEFAULT_VAULT_SETTINGS, type VaultSettings } from '../core/vault/types.ts';

interface SettingsState {
  settings: VaultSettings;
  hasPasskey: boolean;
  refresh: () => void;
  updateSettings: (patch: Partial<VaultSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: { ...DEFAULT_VAULT_SETTINGS },
  hasPasskey: false,

  refresh: () => {
    if (!vaultService.isUnlocked()) return;
    set({
      settings: vaultService.getSettings(),
      hasPasskey: vaultService.getPasskeyRecord() !== null,
    });
  },

  updateSettings: async (patch) => {
    const next = await vaultService.updateSettings(patch);
    if (patch.autoLockMinutes !== undefined) {
      autoLock.updateTimeout(next.autoLockMinutes);
    }
    set({ settings: next });
  },
}));
