import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Eye, EyeOff, KeyRound, Plus, Search, Wand2 } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { EmptyState } from '../../components/ui/EmptyState.tsx';
import { ItemActionsMenu } from '../../components/ui/ItemActionsMenu.tsx';
import { ProtectedRevealModal } from '../../components/ui/ProtectedRevealModal.tsx';
import type { RevealAction, RevealChallenge, RevealGrant } from '../../core/reveal/revealEngine.ts';
import { clipboardGuard, revealEngine, vaultService } from '../../core/runtime.ts';
import type { VaultItemSummary } from '../../core/vault/types.ts';
import { useSettingsStore } from '../../stores/settingsStore.ts';
import { useToastStore } from '../../stores/toastStore.ts';
import { useVaultStore } from '../../stores/vaultStore.ts';
import { PasswordFormModal } from './PasswordFormModal.tsx';
import { PasswordGeneratorModal } from './PasswordGeneratorPopover.tsx';

type PasswordItem = Extract<VaultItemSummary, { type: 'password' }>;

const PASSWORD_REVEAL_TTL_MS = 15_000;

export function PasswordsView() {
  const {
    items,
    categories,
    searchQuery,
    selectedCategoryId,
    selectedTag,
    setSearchQuery,
    setSelectedCategoryId,
    setSelectedTag,
    deleteItem,
  } = useVaultStore();
  const { settings, hasPasskey } = useSettingsStore();
  const clipboardTtl = settings.clipboardClearSeconds;
  const pushToast = useToastStore((s) => s.push);

  const [formOpen, setFormOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [editing, setEditing] = useState<PasswordItem | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [activeChallenge, setActiveChallenge] = useState<RevealChallenge | null>(null);
  const revealTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = revealTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const clearRevealTimer = (id: string) => {
    const existing = revealTimersRef.current.get(id);
    if (existing) {
      clearTimeout(existing);
      revealTimersRef.current.delete(id);
    }
  };

  const passwordItems = useMemo(
    () => items.filter((i): i is PasswordItem => i.type === 'password'),
    [items]
  );

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const item of passwordItems) {
      for (const tag of item.meta.tags) set.add(tag);
    }
    return Array.from(set).sort();
  }, [passwordItems]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return passwordItems.filter((item) => {
      if (selectedCategoryId && item.meta.categoryId !== selectedCategoryId) return false;
      if (selectedTag && !item.meta.tags.includes(selectedTag)) return false;
      if (!q) return true;
      return (
        item.meta.title.toLowerCase().includes(q) ||
        item.meta.website.toLowerCase().includes(q) ||
        item.meta.username.toLowerCase().includes(q) ||
        item.meta.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [passwordItems, searchQuery, selectedCategoryId, selectedTag]);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.id, c.name);
    return map;
  }, [categories]);

  const hidePassword = (id: string) => {
    clearRevealTimer(id);
    setRevealedPasswords((prev) => {
      if (prev[id] === undefined) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleCopyUsername = async (username: string) => {
    if (!username) return;
    await clipboardGuard.copySensitive(username, clipboardTtl);
    pushToast('Username copied.', 'success');
  };

  const executeRevealAction = async (item: PasswordItem, action: RevealAction) => {
    if (action === 'edit') {
      hidePassword(item.id);
      setEditing(item);
      setFormOpen(true);
      return;
    }

    const secret = vaultService.readPasswordSecret(item.id);
    if (action === 'copy') {
      await clipboardGuard.copySensitive(secret.password, clipboardTtl);
      pushToast(`Password copied (clears in ${clipboardTtl}s).`, 'success');
      return;
    }

    clearRevealTimer(item.id);
    const timer = setTimeout(() => {
      revealTimersRef.current.delete(item.id);
      setRevealedPasswords((prev) => {
        if (prev[item.id] === undefined) return prev;
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }, PASSWORD_REVEAL_TTL_MS);
    revealTimersRef.current.set(item.id, timer);
    setRevealedPasswords((prev) => ({ ...prev, [item.id]: secret.password }));
  };

  const requestAction = async (item: PasswordItem, action: RevealAction) => {
    if (action === 'show' && revealedPasswords[item.id] !== undefined) {
      hidePassword(item.id);
      return;
    }

    if (!revealEngine.hasPasskey()) {
      await executeRevealAction(item, action);
      return;
    }

    const challenge = await revealEngine.createChallenge(item.id, action);
    setActiveChallenge(challenge);
  };

  const handleVerified = async (grant: RevealGrant) => {
    setActiveChallenge(null);
    if (!revealEngine.consumeGrant(grant.grantId, grant.itemId, grant.action)) {
      pushToast('Reveal grant expired or invalid.', 'error');
      return;
    }
    const item = passwordItems.find((i) => i.id === grant.itemId);
    if (!item) return;
    await executeRevealAction(item, grant.action);
  };

  const handleDelete = async (item: PasswordItem) => {
    clearRevealTimer(item.id);
    await deleteItem(item.id);
    setRevealedPasswords((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    pushToast(`Deleted "${item.meta.title}".`, 'info');
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3 pr-2.5">
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Passwords</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {passwordItems.length} {passwordItems.length === 1 ? 'entry' : 'entries'} stored locally
            {hasPasskey ? ' • Protected Reveal enabled' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setGenOpen(true)}>
            <Wand2 className="h-4 w-4" />
            Generator
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add Password
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pr-2.5">
        <div className="relative flex-1 min-w-52">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <input
            type="search"
            aria-label="Search passwords"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Search title, website, username, or tag..."
            className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-indigo-500 dark:border-zinc-700/80 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
        </div>

        {categories.length > 0 && (
          <select
            aria-label="Filter by category"
            value={selectedCategoryId ?? ''}
            onChange={(e) => setSelectedCategoryId(e.target.value || null)}
            className="rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-xs text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-zinc-700/80 dark:bg-zinc-950 dark:text-zinc-200"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        {allTags.length > 0 && (
          <select
            value={selectedTag ?? ''}
            onChange={(e) => setSelectedTag(e.target.value || null)}
            className="rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-xs text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-zinc-700/80 dark:bg-zinc-950 dark:text-zinc-200"
          >
            <option value="">All Tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                #{tag}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pr-2.5 pb-1">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<KeyRound className="h-6 w-6" />}
            title={passwordItems.length === 0 ? 'No passwords yet' : 'No matching passwords'}
            description={
              passwordItems.length === 0
                ? 'Add your first login credential to store it securely in your local vault.'
                : 'Try adjusting your search query or filters.'
            }
            action={
              passwordItems.length === 0 ? (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add Password
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((item) => {
              const revealed = revealedPasswords[item.id];
              const catName = item.meta.categoryId
                ? categoryNameById.get(item.meta.categoryId)
                : null;

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-3.5 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {item.meta.title}
                      </span>
                      {catName && (
                        <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          {catName}
                        </span>
                      )}
                      {item.meta.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>

                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {item.meta.username && <span className="truncate">{item.meta.username}</span>}
                      {item.meta.website && (
                        <span className="truncate text-zinc-400 dark:text-zinc-500">
                          {item.meta.website}
                        </span>
                      )}
                    </div>

                    {revealed !== undefined && (
                      <div className="mt-1.5">
                        <code
                          data-selectable="true"
                          className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                        >
                          {revealed}
                        </code>
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {item.meta.username && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleCopyUsername(item.meta.username)}
                        title="Copy username"
                      >
                        User
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void requestAction(item, 'copy')}
                      title="Copy password"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void requestAction(item, 'show')}
                      title={revealed !== undefined ? 'Hide password' : 'Show password'}
                    >
                      {revealed !== undefined ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <ItemActionsMenu
                      onEdit={() => void requestAction(item, 'edit')}
                      onDelete={() => void handleDelete(item)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PasswordFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        editingItem={editing}
      />

      <PasswordGeneratorModal open={genOpen} onClose={() => setGenOpen(false)} />

      <ProtectedRevealModal
        challenge={activeChallenge}
        targetLabel="this password"
        onClose={() => setActiveChallenge(null)}
        onVerified={(grant) => void handleVerified(grant)}
      />
    </div>
  );
}
