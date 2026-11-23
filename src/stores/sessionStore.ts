import { create } from 'zustand';
import { buildPasskeyRecord } from '../core/reveal/passkey.ts';
import { autoLock, clipboardGuard, platform, revealEngine, vaultService } from '../core/runtime.ts';
import { useRevealStore } from './revealStore.ts';
import { useSettingsStore } from './settingsStore.ts';
import { useVaultStore } from './vaultStore.ts';

export type SessionStatus = 'loading' | 'uninitialized' | 'locked' | 'unlocked';
export type NavTab = 'passwords' | 'authenticator' | 'settings';

interface SessionState {
  status: SessionStatus;
  activeTab: NavTab;
  deviceBindingSupported: boolean;
  deviceBound: boolean;
  busy: boolean;
  error: string | null;

  init: () => Promise<void>;
  setActiveTab: (tab: NavTab) => void;
  setup: (
    masterPassword: string,
    options: { deviceBound: boolean; passkey?: string }
  ) => Promise<void>;
  unlock: (masterPassword: string) => Promise<void>;
  lock: () => Promise<void>;
  clearError: () => void;
}

let lifecycleBound = false;

function onUnlocked(): void {
  useVaultStore.getState().refresh();
  useSettingsStore.getState().refresh();
  const settings = useSettingsStore.getState().settings;
  autoLock.start(settings.autoLockMinutes);
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'loading',
  activeTab: 'passwords',
  deviceBindingSupported: vaultService.isDeviceBindingSupported(),
  deviceBound: false,
  busy: false,
  error: null,

  init: async () => {
    if (!lifecycleBound) {
      lifecycleBound = true;
      vaultService.onLock(() => {
        autoLock.stop();
        revealEngine.clearAll();
        useRevealStore.getState().clearAll();
        useVaultStore.getState().clear();
        void clipboardGuard.clearIfOwned();
        set({ status: 'locked', error: null });
      });

      platform.onWindowBlur(() => {
        if (vaultService.isUnlocked() && useSettingsStore.getState().settings.lockOnMinimize) {
          void vaultService.lock();
        }
      });

      platform.onExit(async () => {
        await clipboardGuard.clearIfOwned();
        if (vaultService.isUnlocked()) {
          await vaultService.lock();
        }
      });
    }

    const initialized = await vaultService.isInitialized();
    const deviceBound = initialized ? await vaultService.isDeviceBound() : false;
    set({
      status: initialized ? 'locked' : 'uninitialized',
      deviceBound,
      deviceBindingSupported: vaultService.isDeviceBindingSupported(),
    });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setup: async (masterPassword, options) => {
    set({ busy: true, error: null });
    try {
      await vaultService.setup(masterPassword, { deviceBound: options.deviceBound });
      if (options.passkey) {
        const record = buildPasskeyRecord(vaultService.getPasskeyKey(), options.passkey);
        await vaultService.setPasskeyRecord(record);
      }
      onUnlocked();
      set({
        status: 'unlocked',
        deviceBound: options.deviceBound,
        busy: false,
        error: null,
      });
    } catch (err) {
      set({
        busy: false,
        error: err instanceof Error ? err.message : 'Failed to initialize vault.',
      });
      throw err;
    }
  },

  unlock: async (masterPassword) => {
    set({ busy: true, error: null });
    try {
      await vaultService.unlock(masterPassword);
      onUnlocked();
      set({ status: 'unlocked', busy: false, error: null });
    } catch (err) {
      set({
        busy: false,
        error: err instanceof Error ? err.message : 'Failed to unlock vault.',
      });
    }
  },

  lock: async () => {
    if (get().status !== 'unlocked') return;
    await vaultService.lock();
  },

  clearError: () => set({ error: null }),
}));
