import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Wand2 } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { Input } from '../../components/ui/Input.tsx';
import { Modal } from '../../components/ui/Modal.tsx';
import { vaultService } from '../../core/runtime.ts';
import type { VaultItemSummary } from '../../core/vault/types.ts';
import { useToastStore } from '../../stores/toastStore.ts';
import { useVaultStore } from '../../stores/vaultStore.ts';
import { PasswordGeneratorModal } from './PasswordGeneratorPopover.tsx';

interface PasswordFormModalProps {
  open: boolean;
  onClose: () => void;
  editingItem?: Extract<VaultItemSummary, { type: 'password' }> | null;
}

export function PasswordFormModal({ open, onClose, editingItem }: PasswordFormModalProps) {
  const { categories, createPassword, updatePassword } = useVaultStore();
  const pushToast = useToastStore((s) => s.push);

  const [title, setTitle] = useState('');
  const [website, setWebsite] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingItem) {
      setTitle(editingItem.meta.title);
      setWebsite(editingItem.meta.website);
      setUsername(editingItem.meta.username);
      setCategoryId(editingItem.meta.categoryId ?? '');
      setTagsRaw(editingItem.meta.tags.join(', '));
      const secret = vaultService.readPasswordSecret(editingItem.id);
      setPassword(secret.password);
      setNotes(secret.notes);
    } else {
      setTitle('');
      setWebsite('');
      setUsername('');
      setPassword('');
      setNotes('');
      setCategoryId('');
      setTagsRaw('');
    }
    setShowPassword(false);
  }, [open, editingItem]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !password) return;
    setBusy(true);
    try {
      const tags = tagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const meta = {
        title: title.trim(),
        website: website.trim(),
        username: username.trim(),
        categoryId: categoryId || null,
        tags,
      };
      const secret = { password, notes };

      if (editingItem) {
        await updatePassword(editingItem.id, meta, secret);
        pushToast('Password updated.', 'success');
      } else {
        await createPassword(meta, secret);
        pushToast('Password saved.', 'success');
      }
      onClose();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to save password.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={editingItem ? 'Edit Password' : 'Add Password'}
      >
        <form onSubmit={handleSubmit} autoComplete="off" className="flex flex-col gap-3">
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. GitHub"
            required
            autoFocus
          />

          <Input
            label="Website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://github.com"
          />

          <Input
            label="Username / Email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="user@example.com"
          />

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Password
            </label>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  required
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 pr-9 text-sm text-zinc-900 focus:border-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-indigo-500 dark:border-zinc-700/80 dark:bg-zinc-950 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setGenOpen(true)}
                title="Generate password"
              >
                <Wand2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Category
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-indigo-500 dark:border-zinc-700/80 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Tags (comma-separated)"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="work, dev"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="Optional notes..."
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-indigo-500 dark:border-zinc-700/80 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>

      <PasswordGeneratorModal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        onUsePassword={(pw) => setPassword(pw)}
      />
    </>
  );
}
