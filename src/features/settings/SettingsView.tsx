import { useState, type FormEvent } from 'react';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { Input } from '../../components/ui/Input.tsx';
import { exportEncryptedBackup } from '../../core/backup/backupService.ts';
import { buildPasskeyRecord } from '../../core/reveal/passkey.ts';
import { platform, vaultService } from '../../core/runtime.ts';
import { useSessionStore } from '../../stores/sessionStore.ts';
import { useSettingsStore } from '../../stores/settingsStore.ts';
import { useToastStore } from '../../stores/toastStore.ts';
import { useVaultStore } from '../../stores/vaultStore.ts';
import { RestoreBackupModal } from './RestoreBackupModal.tsx';

export function SettingsView() {
  const { settings, hasPasskey, updateSettings, refresh: refreshSettings } = useSettingsStore();
  const { categories, createCategory, deleteCategory } = useVaultStore();
  const deviceBound = useSessionStore((s) => s.deviceBound);
  const pushToast = useToastStore((s) => s.push);

  const [newCategory, setNewCategory] = useState('');

  // Passkey form
  const [passkeyMasterPw, setPasskeyMasterPw] = useState('');
  const [newPasskey, setNewPasskey] = useState('');
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  // Master password form
  const [currentMp, setCurrentMp] = useState('');
  const [nextMp, setNextMp] = useState('');
  const [confirmMp, setConfirmMp] = useState('');
  const [mpBusy, setMpBusy] = useState(false);

  // Backup export
  const [backupMasterPw, setBackupMasterPw] = useState('');
  const [backupPw, setBackupPw] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  const handleSavePasskey = async (e: FormEvent) => {
    e.preventDefault();
    if (!passkeyMasterPw) {
      pushToast('Enter your Master Password to update the Passkey.', 'error');
      return;
    }
    setPasskeyBusy(true);
    try {
      const record = buildPasskeyRecord(vaultService.getPasskeyKey(), newPasskey);
      await vaultService.setPasskeyWithMasterPassword(passkeyMasterPw, record);
      refreshSettings();
      setNewPasskey('');
      setPasskeyMasterPw('');
      pushToast('Protected Reveal Passkey updated.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Invalid passkey or master password.', 'error');
    } finally {
      setPasskeyBusy(false);
    }
  };

  const handleRemovePasskey = async () => {
    if (!passkeyMasterPw) {
      pushToast('Enter your current Master Password below to remove the Passkey.', 'error');
      return;
    }
    setPasskeyBusy(true);
    try {
      await vaultService.setPasskeyWithMasterPassword(passkeyMasterPw, null);
      refreshSettings();
      setPasskeyMasterPw('');
      pushToast('Passkey removed.', 'info');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Invalid master password.', 'error');
    } finally {
      setPasskeyBusy(false);
    }
  };

  const handleChangeMasterPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (nextMp !== confirmMp) {
      pushToast('New passwords do not match.', 'error');
      return;
    }
    setMpBusy(true);
    try {
      await vaultService.changeMasterPassword(currentMp, nextMp);
      setCurrentMp('');
      setNextMp('');
      setConfirmMp('');
      pushToast('Master Password updated.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to update Master Password.', 'error');
    } finally {
      setMpBusy(false);
    }
  };

  const handleExportBackup = async (e: FormEvent) => {
    e.preventDefault();
    if (!backupMasterPw) {
      pushToast('Enter your current Master Password to export a backup.', 'error');
      return;
    }
    if (backupPw.length < 8) {
      pushToast('Backup password must be at least 8 characters.', 'error');
      return;
    }
    setBackupBusy(true);
    try {
      await vaultService.verifyMasterPassword(backupMasterPw);
      const bytes = await exportEncryptedBackup(vaultService, backupPw);
      if (platform.isDesktop) {
        const dest = await platform.saveFileDialog({
          title: 'Save Encrypted AuthNook Backup',
          defaultPath: `authnook-backup-${new Date().toISOString().slice(0, 10)}.authnook`,
          filters: [{ name: 'AuthNook Backup', extensions: ['authnook'] }],
        });
        if (!dest) return;
        await platform.writeFileAtomic(dest, bytes);
      } else {
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        const blob = new Blob([copy.buffer], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `authnook-backup-${new Date().toISOString().slice(0, 10)}.authnook`;
        a.click();
        URL.revokeObjectURL(url);
      }
      await updateSettings({ lastBackupAt: Date.now() });
      setBackupMasterPw('');
      setBackupPw('');
      pushToast('Encrypted backup exported.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Export failed.', 'error');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleAddCategory = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCategory.trim()) return;
    await createCategory(newCategory.trim());
    setNewCategory('');
    pushToast('Category added.', 'success');
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-2.5 pb-1">
      <div>
        <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Settings</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Security, Protected Reveal, categories, and encrypted backups.
          {deviceBound ? ' Device binding is active.' : ' Device binding is off.'}
        </p>
      </div>

      {/* Security Preferences */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Security &amp; Timing
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Auto-lock idle timeout
            </label>
            <select
              value={settings.autoLockMinutes}
              onChange={(e) => void updateSettings({ autoLockMinutes: Number(e.target.value) })}
              className="rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value={1}>1 minute</option>
              <option value={5}>5 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={0}>Never</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Clipboard auto-clear
            </label>
            <select
              value={settings.clipboardClearSeconds}
              onChange={(e) =>
                void updateSettings({ clipboardClearSeconds: Number(e.target.value) })
              }
              className="rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value={15}>15 seconds</option>
              <option value={30}>30 seconds</option>
              <option value={60}>60 seconds</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              OTP auto-hide delay
            </label>
            <select
              value={settings.otpHideSeconds}
              onChange={(e) => void updateSettings({ otpHideSeconds: Number(e.target.value) })}
              className="rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value={5}>5 seconds</option>
              <option value={8}>8 seconds</option>
              <option value={10}>10 seconds</option>
            </select>
          </div>
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={settings.lockOnMinimize}
            onChange={(e) => void updateSettings({ lockOnMinimize: e.target.checked })}
            className="h-4 w-4 rounded border-zinc-300 text-indigo-600"
          />
          Lock vault automatically when window loses focus
        </label>
      </section>

      {/* Protected Reveal Passkey */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Protected Reveal Passkey
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {hasPasskey
                ? 'Passkey is active. 3 consecutive wrong digits lock the vault.'
                : 'Not configured yet. Set a 4-8 digit Passkey to protect password & OTP reveal, copy, and edit.'}
            </p>
          </div>
          {hasPasskey && (
            <Button variant="ghost" size="sm" onClick={() => void handleRemovePasskey()}>
              Remove Passkey
            </Button>
          )}
        </div>

        <form onSubmit={handleSavePasskey} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            label="Current Master Password"
            type="password"
            value={passkeyMasterPw}
            onChange={(e) => setPasskeyMasterPw(e.target.value)}
            placeholder="Required to change or remove"
            required
          />
          <Input
            label={hasPasskey ? 'New Passkey' : 'Set Passkey'}
            type="password"
            inputMode="numeric"
            value={newPasskey}
            onChange={(e) => setNewPasskey(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="4-8 digits (e.g. 12345)"
            required
          />
          <Button type="submit" disabled={passkeyBusy}>
            {hasPasskey ? 'Update' : 'Enable'}
          </Button>
        </form>
      </section>

      {/* Categories */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Categories</h2>
        <form onSubmit={handleAddCategory} className="mb-3 flex gap-2">
          <div className="flex-1">
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="New category name (e.g. Banking, Work)"
            />
          </div>
          <Button type="submit" variant="secondary">
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </form>
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-2.5 py-1 text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
              >
                {c.name}
                <button
                  type="button"
                  onClick={() => void deleteCategory(c.id)}
                  className="text-zinc-400 hover:text-red-500"
                  aria-label={`Delete ${c.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Backup & Restore */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Encrypted Backup &amp; Restore
        </h2>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          Backups are encrypted with a separate backup password and are not bound to this device, so you can restore on Windows or macOS.
        </p>

        <form onSubmit={handleExportBackup} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
          <Input
            label="Current Master Password"
            type="password"
            value={backupMasterPw}
            onChange={(e) => setBackupMasterPw(e.target.value)}
            placeholder="Required to export"
            required
          />
          <Input
            label="Backup Password"
            type="password"
            value={backupPw}
            onChange={(e) => setBackupPw(e.target.value)}
            placeholder="At least 8 characters"
            required
          />
          <Button type="submit" disabled={backupBusy}>
            <Download className="h-4 w-4" />
            {backupBusy ? 'Exporting...' : 'Export Backup'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setRestoreOpen(true)}>
            <Upload className="h-4 w-4" />
            Restore
          </Button>
        </form>
      </section>

      {/* Change Master Password */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Change Master Password
        </h2>
        <form onSubmit={handleChangeMasterPassword} className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <Input
            label="Current Password"
            type="password"
            value={currentMp}
            onChange={(e) => setCurrentMp(e.target.value)}
            required
          />
          <Input
            label="New Password"
            type="password"
            value={nextMp}
            onChange={(e) => setNextMp(e.target.value)}
            required
          />
          <Input
            label="Confirm New Password"
            type="password"
            value={confirmMp}
            onChange={(e) => setConfirmMp(e.target.value)}
            required
          />
          <div className="sm:col-span-3 flex justify-end">
            <Button type="submit" variant="secondary" disabled={mpBusy}>
              {mpBusy ? 'Updating...' : 'Update Master Password'}
            </Button>
          </div>
        </form>
      </section>

      <RestoreBackupModal
        open={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        isOverwrite={true}
      />
    </div>
  );
}
