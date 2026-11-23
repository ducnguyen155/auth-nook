import { useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button.tsx';
import { Input } from '../../components/ui/Input.tsx';
import { Modal } from '../../components/ui/Modal.tsx';
import { decryptEncryptedBackup } from '../../core/backup/backupService.ts';
import { platform, vaultService } from '../../core/runtime.ts';
import { useSessionStore } from '../../stores/sessionStore.ts';
import { useToastStore } from '../../stores/toastStore.ts';

interface RestoreBackupModalProps {
  open: boolean;
  onClose: () => void;
  isOverwrite: boolean;
}

export function RestoreBackupModal({ open, onClose, isOverwrite }: RestoreBackupModalProps) {
  const { deviceBindingSupported, init } = useSessionStore();
  const pushToast = useToastStore((s) => s.push);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [backupPassword, setBackupPassword] = useState('');
  const [newMasterPassword, setNewMasterPassword] = useState('');
  const [deviceBound, setDeviceBound] = useState(deviceBindingSupported);
  const [confirmed, setConfirmed] = useState(!isOverwrite);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChooseFile = async () => {
    setError(null);
    if (platform.isDesktop) {
      const path = await platform.openFileDialog({
        title: 'Select AuthNook Backup File',
        filters: [{ name: 'AuthNook Backup', extensions: ['authnook', 'json'] }],
      });
      if (!path) return;
      const bytes = await platform.readFile(path);
      setFileBytes(bytes);
      setFileName(path.split(/[\\/]/).pop() ?? path);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fileBytes) {
      setError('Please select a backup file.');
      return;
    }
    if (!confirmed) {
      setError('Please confirm overwriting the existing vault.');
      return;
    }
    if (newMasterPassword.length < 8) {
      setError('New master password must be at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      const payload = await decryptEncryptedBackup(fileBytes, backupPassword);
      await vaultService.restoreFromPlainPayload(payload, newMasterPassword, {
        deviceBound: deviceBindingSupported && deviceBound,
      });
      await vaultService.lock();
      await init();
      pushToast('Backup restored. Unlock your vault with the new Master Password.', 'success');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore backup.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Restore from Encrypted Backup">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <input
          ref={fileInputRef}
          type="file"
          accept=".authnook,.json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const buf = await file.arrayBuffer();
            setFileBytes(new Uint8Array(buf));
            setFileName(file.name);
          }}
        />

        <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <span className="truncate text-xs text-zinc-600 dark:text-zinc-300">
            {fileName ?? 'No backup file selected'}
          </span>
          <Button type="button" variant="secondary" size="sm" onClick={() => void handleChooseFile()}>
            Browse...
          </Button>
        </div>

        <Input
          label="Backup Password"
          type="password"
          value={backupPassword}
          onChange={(e) => setBackupPassword(e.target.value)}
          placeholder="Password used when exporting"
          required
        />

        <Input
          label="New Master Password for This Vault"
          type="password"
          value={newMasterPassword}
          onChange={(e) => setNewMasterPassword(e.target.value)}
          placeholder="At least 8 characters"
          required
        />

        {deviceBindingSupported && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={deviceBound}
              onChange={(e) => setDeviceBound(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-indigo-600"
            />
            Bind restored vault to this device
          </label>
        )}

        {isOverwrite && (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-red-300 text-red-600"
            />
            <span>I understand this will permanently overwrite my current vault.</span>
          </label>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/60 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Restoring...' : 'Restore Vault'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
