import { useState, type FormEvent } from 'react';
import { Lock, Upload } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { Input } from '../../components/ui/Input.tsx';
import { useSessionStore } from '../../stores/sessionStore.ts';
import { RestoreBackupModal } from '../settings/RestoreBackupModal.tsx';

export function UnlockView() {
  const { unlock, busy, error, deviceBound, clearError } = useSessionStore();
  const [masterPassword, setMasterPassword] = useState('');
  const [restoreOpen, setRestoreOpen] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!masterPassword) return;
    await unlock(masterPassword);
    setMasterPassword('');
  };

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Unlock AuthNook</h1>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {deviceBound
              ? 'Device-bound vault. Enter your Master Password.'
              : 'Enter your Master Password to unlock.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <Input
            label="Master Password"
            type="password"
            autoFocus
            value={masterPassword}
            onChange={(e) => {
              if (error) clearError();
              setMasterPassword(e.target.value);
            }}
            placeholder="Enter master password"
            required
          />

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/60 dark:text-red-300">
              {error}
            </div>
          )}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Unlocking...' : 'Unlock'}
          </Button>
        </form>

        <div className="mt-4 border-t border-zinc-200 pt-3 text-center dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setRestoreOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            <Upload className="h-3.5 w-3.5" />
            Restore from backup
          </button>
        </div>
      </div>

      <RestoreBackupModal
        open={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        isOverwrite={true}
      />
    </div>
  );
}
