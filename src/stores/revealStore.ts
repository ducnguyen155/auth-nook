import { create } from 'zustand';

export interface RevealedTotpEntry {
  itemId: string;
  otp: string;
  staticCode?: string;
  showStaticCode: boolean;
  expiresAt: number;
}

interface RevealState {
  revealed: Record<string, RevealedTotpEntry>;
  show: (entry: Omit<RevealedTotpEntry, 'showStaticCode' | 'expiresAt'>, hideSeconds: number) => void;
  toggleStaticCode: (itemId: string) => void;
  hide: (itemId: string) => void;
  clearAll: () => void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useRevealStore = create<RevealState>((set) => ({
  revealed: {},

  show: (entry, hideSeconds) => {
    const existing = timers.get(entry.itemId);
    if (existing) clearTimeout(existing);

    const expiresAt = Date.now() + hideSeconds * 1000;
    const timer = setTimeout(() => {
      timers.delete(entry.itemId);
      set((s) => {
        const next = { ...s.revealed };
        delete next[entry.itemId];
        return { revealed: next };
      });
    }, hideSeconds * 1000);
    timers.set(entry.itemId, timer);

    set((s) => ({
      revealed: {
        ...s.revealed,
        [entry.itemId]: {
          ...entry,
          showStaticCode: false,
          expiresAt,
        },
      },
    }));
  },

  toggleStaticCode: (itemId) =>
    set((s) => {
      const current = s.revealed[itemId];
      if (!current) return s;
      return {
        revealed: {
          ...s.revealed,
          [itemId]: { ...current, showStaticCode: !current.showStaticCode },
        },
      };
    }),

  hide: (itemId) => {
    const timer = timers.get(itemId);
    if (timer) {
      clearTimeout(timer);
      timers.delete(itemId);
    }
    set((s) => {
      const next = { ...s.revealed };
      delete next[itemId];
      return { revealed: next };
    });
  },

  clearAll: () => {
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    timers.clear();
    set({ revealed: {} });
  },
}));
