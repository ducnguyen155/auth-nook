import { create } from 'zustand';
import { vaultService } from '../core/runtime.ts';
import type {
  CategoryItem,
  PasswordMeta,
  PasswordSecret,
  TotpMeta,
  TotpSecret,
  VaultItemSummary,
} from '../core/vault/types.ts';

interface VaultState {
  items: VaultItemSummary[];
  categories: CategoryItem[];
  searchQuery: string;
  selectedCategoryId: string | null;
  selectedTag: string | null;

  refresh: () => void;
  clear: () => void;
  setSearchQuery: (q: string) => void;
  setSelectedCategoryId: (id: string | null) => void;
  setSelectedTag: (tag: string | null) => void;

  createPassword: (meta: PasswordMeta, secret: PasswordSecret) => Promise<void>;
  updatePassword: (id: string, meta: PasswordMeta, secret?: PasswordSecret) => Promise<void>;
  createTotp: (meta: TotpMeta, secret: TotpSecret) => Promise<void>;
  updateTotp: (id: string, meta: TotpMeta, secret?: TotpSecret) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;

  createCategory: (name: string) => Promise<CategoryItem>;
  deleteCategory: (id: string) => Promise<void>;
}

export const useVaultStore = create<VaultState>((set, get) => ({
  items: [],
  categories: [],
  searchQuery: '',
  selectedCategoryId: null,
  selectedTag: null,

  refresh: () => {
    if (!vaultService.isUnlocked()) return;
    set({
      items: vaultService.listItems(),
      categories: vaultService.listCategories(),
    });
  },

  clear: () =>
    set({
      items: [],
      categories: [],
      searchQuery: '',
      selectedCategoryId: null,
      selectedTag: null,
    }),

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedCategoryId: (selectedCategoryId) => set({ selectedCategoryId }),
  setSelectedTag: (selectedTag) => set({ selectedTag }),

  createPassword: async (meta, secret) => {
    await vaultService.createPasswordItem(meta, secret);
    get().refresh();
  },

  updatePassword: async (id, meta, secret) => {
    await vaultService.updatePasswordItem(id, meta, secret);
    get().refresh();
  },

  createTotp: async (meta, secret) => {
    await vaultService.createTotpItem(meta, secret);
    get().refresh();
  },

  updateTotp: async (id, meta, secret) => {
    await vaultService.updateTotpItem(id, meta, secret);
    get().refresh();
  },

  deleteItem: async (id) => {
    await vaultService.deleteItem(id);
    get().refresh();
  },

  createCategory: async (name) => {
    const cat = await vaultService.createCategory(name);
    get().refresh();
    return cat;
  },

  deleteCategory: async (id) => {
    await vaultService.deleteCategory(id);
    if (get().selectedCategoryId === id) {
      set({ selectedCategoryId: null });
    }
    get().refresh();
  },
}));
