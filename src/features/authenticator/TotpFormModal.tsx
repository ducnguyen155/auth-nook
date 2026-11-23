import { useEffect, useRef, useState, type FormEvent } from 'react';
import { QrCode } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { Input } from '../../components/ui/Input.tsx';
import { Modal } from '../../components/ui/Modal.tsx';
import { vaultService } from '../../core/runtime.ts';
import { composeCode, validateSeparator, validateStaticCode } from '../../core/totp/composeCode.ts';
import { parseOtpAuthUri } from '../../core/totp/otpauthUri.ts';
import { decodeTotpQrFromBlob } from '../../core/totp/qrDecoder.ts';
import { isValidBase32Secret, normalizeBase32Secret } from '../../core/totp/totp.ts';
import type { StaticCodePosition, TotpAlgorithm, VaultItemSummary } from '../../core/vault/types.ts';
import { useToastStore } from '../../stores/toastStore.ts';
import { useVaultStore } from '../../stores/vaultStore.ts';

interface TotpFormModalProps {
  open: boolean;
  onClose: () => void;
  editingItem?: Extract<VaultItemSummary, { type: 'totp' }> | null;
}

export function TotpFormModal({ open, onClose, editingItem }: TotpFormModalProps) {
  const { categories, createTotp, updateTotp } = useVaultStore();
  const pushToast = useToastStore((s) => s.push);
  const qrInputRef = useRef<HTMLInputElement | null>(null);

  const [issuer, setIssuer] = useState('');
  const [account, setAccount] = useState('');
  const [secret, setSecret] = useState('');
  const [digits, setDigits] = useState<6 | 8>(6);
  const [period, setPeriod] = useState(30);
  const [algorithm, setAlgorithm] = useState<TotpAlgorithm>('SHA1');
  const [categoryId, setCategoryId] = useState<string>('');

  const [staticCode, setStaticCode] = useState('');
  const [staticPosition, setStaticPosition] = useState<StaticCodePosition>('prefix');
  const [staticSeparator, setStaticSeparator] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingItem) {
      setIssuer(editingItem.meta.issuer);
      setAccount(editingItem.meta.account);
      setDigits(editingItem.meta.digits);
      setPeriod(editingItem.meta.period);
      setAlgorithm(editingItem.meta.algorithm);
      setCategoryId(editingItem.meta.categoryId ?? '');
      setStaticPosition(editingItem.meta.staticCodePosition);
      setStaticSeparator(editingItem.meta.staticCodeSeparator);
      const sec = vaultService.readTotpSecret(editingItem.id);
      setSecret(sec.secret);
      setStaticCode(sec.staticCode ?? '');
    } else {
      setIssuer('');
      setAccount('');
      setSecret('');
      setDigits(6);
      setPeriod(30);
      setAlgorithm('SHA1');
      setCategoryId('');
      setStaticCode('');
      setStaticPosition('prefix');
      setStaticSeparator('');
    }
  }, [open, editingItem]);

  const handleQrBlob = async (blob: Blob) => {
    setError(null);
    try {
      const parsed = await decodeTotpQrFromBlob(blob);
      setIssuer(parsed.issuer);
      setAccount(parsed.account);
      setSecret(parsed.secret);
      setDigits(parsed.digits);
      setPeriod(parsed.period);
      setAlgorithm(parsed.algorithm);
      pushToast('QR code imported.', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decode QR code.');
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          e.preventDefault();
          await handleQrBlob(blob);
          return;
        }
      }
    }
  };

  const handleSecretOrUriChange = (val: string) => {
    if (val.trim().toLowerCase().startsWith('otpauth://')) {
      try {
        const parsed = parseOtpAuthUri(val);
        setIssuer(parsed.issuer);
        setAccount(parsed.account);
        setSecret(parsed.secret);
        setDigits(parsed.digits);
        setPeriod(parsed.period);
        setAlgorithm(parsed.algorithm);
        setError(null);
        return;
      } catch {
        // Fall through to normal input
      }
    }
    setSecret(val);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const normalizedSecret = normalizeBase32Secret(secret);
    if (!isValidBase32Secret(normalizedSecret)) {
      setError('Invalid Base32 secret key.');
      return;
    }

    let validStatic: string | undefined;
    let validSep: string;
    try {
      validStatic = validateStaticCode(staticCode);
      validSep = validateSeparator(staticSeparator);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid static code.');
      return;
    }

    setBusy(true);
    try {
      const meta = {
        issuer: issuer.trim() || 'Authenticator',
        account: account.trim() || 'Account',
        digits,
        period,
        algorithm,
        categoryId: categoryId || null,
        hasStaticCode: Boolean(validStatic),
        staticCodePosition: staticPosition,
        staticCodeSeparator: validSep,
      };
      const sec = {
        secret: normalizedSecret,
        ...(validStatic ? { staticCode: validStatic } : {}),
      };

      if (editingItem) {
        await updateTotp(editingItem.id, meta, sec);
        pushToast('Authenticator account updated.', 'success');
      } else {
        await createTotp(meta, sec);
        pushToast('Authenticator account added.', 'success');
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save account.');
    } finally {
      setBusy(false);
    }
  };

  const maskedStatic = staticCode ? '•'.repeat(Math.min(staticCode.length, 4)) : undefined;
  const previewMasked = maskedStatic
    ? composeCode('••••••', {
        staticCode: maskedStatic,
        position: staticPosition,
        separator: staticSeparator,
      })
    : '••••••';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingItem ? 'Edit Authenticator' : 'Add Authenticator'}
      maxWidthClass="max-w-lg"
    >
      <form
        onSubmit={handleSubmit}
        onPaste={handlePaste}
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) await handleQrBlob(file);
        }}
        className="flex flex-col gap-3.5"
      >
        {!editingItem && (
          <div className="flex items-center justify-between rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3.5 py-2.5 dark:border-zinc-700/70 dark:bg-zinc-800/40">
            <div className="flex items-center gap-2.5 text-xs text-zinc-600 dark:text-zinc-300">
              <QrCode className="h-4 w-4 text-indigo-500" />
              <span>Import QR image (select, drag-drop, or Ctrl+V paste)</span>
            </div>
            <input
              ref={qrInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await handleQrBlob(file);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => qrInputRef.current?.click()}
            >
              Choose Image
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <Input
            label="Issuer"
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            placeholder="e.g. Google, GitHub"
            required
            autoFocus
          />
          <Input
            label="Account"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="user@example.com"
          />
        </div>

        <Input
          label="Secret Key (Base32 or otpauth:// URI)"
          type={editingItem ? 'password' : 'text'}
          value={secret}
          onChange={(e) => handleSecretOrUriChange(e.target.value)}
          placeholder="JBSWY3DPEHPK3PXP"
          required
        />

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Category</label>
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

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700/60 dark:bg-zinc-800/40">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              Static Code (Optional)
            </span>
            <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              Preview: {previewMasked}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Input
              label="Static Code"
              type="password"
              value={staticCode}
              onChange={(e) => setStaticCode(e.target.value)}
              placeholder="e.g. AAA"
            />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Position
              </label>
              <select
                value={staticPosition}
                onChange={(e) => setStaticPosition(e.target.value as StaticCodePosition)}
                className="rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-indigo-500 dark:border-zinc-700/80 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="prefix">Before OTP</option>
                <option value="suffix">After OTP</option>
              </select>
            </div>
            <Input
              label="Separator"
              maxLength={3}
              value={staticSeparator}
              onChange={(e) => setStaticSeparator(e.target.value)}
              placeholder="None (or -)"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            Encrypted alongside your TOTP secret. Automatically combined when copying the OTP.
          </p>
        </div>

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
            {busy ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
