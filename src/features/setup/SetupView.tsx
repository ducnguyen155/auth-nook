import { useState, type FormEvent } from 'react';
import { ShieldCheck, AlertTriangle, Upload } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { Input } from '../../components/ui/Input.tsx';
import { validatePasskey } from '../../core/reveal/passkey.ts';
import { useSessionStore } from '../../stores/sessionStore.ts';
import { useToastStore } from '../../stores/toastStore.ts';
import { RestoreBackupModal } from '../settings/RestoreBackupModal.tsx';

function passwordStrength(pw: string): { label: string; score: number; color: string } {
  if (!pw) return { label: '', score: 0, color: 'bg-zinc-300' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { label: 'Weak', score: 1, color: 'bg-red-500' };
  if (score === 2) return { label: 'Fair', score: 2, color: 'bg-amber-500' };
  if (score === 3) return { label: 'Good', score: 3, color: 'bg-emerald-500' };
  return { label: 'Strong', score: 4, color: 'bg-emerald-600' };
}

export function SetupView() {
  const { setup, deviceBindingSupported, busy } = useSessionStore();
  const pushToast = useToastStore((s) => s.push);

  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passkey, setPasskey] = useState('');
  const [deviceBound, setDeviceBound] = useState(deviceBindingSupported);
  const [formError, setFormError] = useState<string | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);

  const strength = passwordStrength(masterPassword);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (masterPassword.length < 8) {
      setFormError('Master password must be at least 8 characters.');
      return;
    }
    if (masterPassword !== confirmPassword) {
      setFormError('Master passwords do not match.');
      return;
    }
    if (passkey.trim().length > 0) {
      try {
        validatePasskey(passkey.trim());
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Invalid passkey.');
        return;
      }
    }

    try {
      await setup(masterPassword, {
        deviceBound: deviceBindingSupported && deviceBound,
        passkey: passkey.trim() || undefined,
      });
      pushToast('Vault created. Remember to export an encrypted backup soon.', 'success');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Setup failed.');
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Create Your AuthNook Vault
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Passwords &amp; Authentication. Simplified.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Input
              label="Master Password"
              type="password"
              autoFocus
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
            />
            {masterPassword && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex flex-1 gap-1">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`h-1 flex-1 rounded-full ${
                        step <= strength.score ? strength.color : 'bg-zinc-200 dark:bg-zinc-800'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {strength.label}
                </span>
              </div>
            )}
          </div>

          <Input
            label="Confirm Master Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter master password"
            required
          />

          <Input
            label="Protected Reveal Passkey (Optional)"
            type="password"
            inputMode="numeric"
            value={passkey}
            onChange={(e) => setPasskey(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="4-8 digits (e.g. 12345)"
            hint="Used to verify a random character before showing or copying OTP codes. You can also set this later in Settings."
          />

          {deviceBindingSupported && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/60">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={deviceBound}
                  onChange={(e) => setDeviceBound(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="flex-1">
                  <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    Bind vault to this device &amp; OS account
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    Prevents unlocking even with your Master Password if the vault file is copied to another machine.
                  </p>
                </div>
              </label>

              {deviceBound && (
                <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-[11px] text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    If you reinstall your OS, switch accounts, or change devices, this vault cannot be opened without an encrypted <strong>.authnook</strong> backup file.
                  </span>
                </div>
              )}
            </div>
          )}

          {formError && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/60 dark:text-red-300">
              {formError}
            </div>
          )}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Creating Vault...' : 'Create Vault'}
          </Button>
        </form>

        <div className="mt-4 border-t border-zinc-200 pt-3 text-center dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setRestoreOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            <Upload className="h-3.5 w-3.5" />
            Restore from encrypted backup
          </button>
        </div>
      </div>

      <RestoreBackupModal
        open={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        isOverwrite={false}
      />
    </div>
  );
}
