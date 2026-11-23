import { useEffect, useMemo, useState } from 'react';
import { Copy, Eye, EyeOff, Link2, Plus, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { CountdownRing } from '../../components/ui/CountdownRing.tsx';
import { EmptyState } from '../../components/ui/EmptyState.tsx';
import { ItemActionsMenu } from '../../components/ui/ItemActionsMenu.tsx';
import type { RevealAction, RevealChallenge, RevealGrant } from '../../core/reveal/revealEngine.ts';
import { clipboardGuard, revealEngine, vaultService } from '../../core/runtime.ts';
import { composeCode } from '../../core/totp/composeCode.ts';
import {
  effectiveEpochForCopy,
  generateTotpCode,
  remainingSeconds,
} from '../../core/totp/totp.ts';
import type { VaultItemSummary } from '../../core/vault/types.ts';
import { useRevealStore } from '../../stores/revealStore.ts';
import { useSettingsStore } from '../../stores/settingsStore.ts';
import { useToastStore } from '../../stores/toastStore.ts';
import { useVaultStore } from '../../stores/vaultStore.ts';
import { ProtectedRevealModal } from './ProtectedRevealModal.tsx';
import { TotpFormModal } from './TotpFormModal.tsx';

type TotpItem = Extract<VaultItemSummary, { type: 'totp' }>;

export function AuthenticatorView() {
  const { items, categories, deleteItem } = useVaultStore();
  const { settings, hasPasskey } = useSettingsStore();
  const { revealed, show, hide, toggleStaticCode } = useRevealStore();
  const pushToast = useToastStore((s) => s.push);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TotpItem | null>(null);
  const [activeChallenge, setActiveChallenge] = useState<RevealChallenge | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const totpItems = useMemo(
    () => items.filter((i): i is TotpItem => i.type === 'totp'),
    [items]
  );

  const filteredItems = useMemo(() => {
    if (!categoryFilter) return totpItems;
    return totpItems.filter((i) => (i.meta.categoryId ?? null) === categoryFilter);
  }, [totpItems, categoryFilter]);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.id, c.name);
    return map;
  }, [categories]);

  const executeRevealAction = async (item: TotpItem, action: RevealAction) => {
    if (action === 'edit') {
      setEditing(item);
      setFormOpen(true);
      return;
    }

    const secret = vaultService.readTotpSecret(item.id);
    if (action === 'show') {
      const otp = generateTotpCode({
        secret: secret.secret,
        digits: item.meta.digits,
        period: item.meta.period,
        algorithm: item.meta.algorithm,
      });
      show(
        {
          itemId: item.id,
          otp,
          staticCode: secret.staticCode,
        },
        settings.otpHideSeconds
      );
      return;
    }

    const epoch = effectiveEpochForCopy(item.meta.period);
    const otp = generateTotpCode({
      secret: secret.secret,
      digits: item.meta.digits,
      period: item.meta.period,
      algorithm: item.meta.algorithm,
      epochSeconds: epoch,
    });
    const finalCode = composeCode(otp, {
      staticCode: secret.staticCode,
      position: item.meta.staticCodePosition,
      separator: item.meta.staticCodeSeparator,
    });

    await clipboardGuard.copySensitive(finalCode, settings.clipboardClearSeconds);
    pushToast(
      secret.staticCode
        ? `Combined code copied (clears in ${settings.clipboardClearSeconds}s).`
        : `OTP copied (clears in ${settings.clipboardClearSeconds}s).`,
      'success'
    );
  };

  const requestAction = async (item: TotpItem, action: RevealAction) => {
    if (action === 'show' && revealed[item.id]) {
      hide(item.id);
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
    const item = totpItems.find((i) => i.id === grant.itemId);
    if (!item) return;
    await executeRevealAction(item, grant.action);
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3 pr-2.5">
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Authenticator</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {hasPasskey
              ? 'Protected Reveal enabled — Passkey verification required to show or copy OTP.'
              : 'No Passkey configured — set one in Settings to enable Protected Reveal.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {categories.length > 0 && (
            <select
              aria-label="Filter by category"
              value={categoryFilter ?? ''}
              onChange={(e) => setCategoryFilter(e.target.value || null)}
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
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add Account
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2.5 pb-1">
        {filteredItems.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="h-6 w-6" />}
            title={totpItems.length === 0 ? 'No authenticator accounts yet' : 'No accounts in this category'}
            description={
              totpItems.length === 0
                ? 'Import a QR code or enter a Base32 secret key to generate 6-digit TOTP codes.'
                : 'Select another category or add an account to this one.'
            }
            action={
              totpItems.length === 0 ? (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add Account
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filteredItems.map((item) => {
              const rem = remainingSeconds(item.meta.period, nowMs);
              const rev = revealed[item.id];
              const catName = item.meta.categoryId
                ? categoryNameById.get(item.meta.categoryId)
                : null;

              const rawOtp = rev?.otp ?? '•'.repeat(item.meta.digits);
              const half = Math.floor(rawOtp.length / 2);
              const displayOtp = `${rawOtp.slice(0, half)} ${rawOtp.slice(half)}`;

              const staticDisplay = rev?.staticCode
                ? rev.showStaticCode
                  ? rev.staticCode
                  : '•••'
                : item.meta.hasStaticCode
                ? '•••'
                : null;

              return (
                <div
                  key={item.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {item.meta.issuer}
                        </span>
                        {catName && (
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            {catName}
                          </span>
                        )}
                        {item.meta.hasStaticCode && (
                          <span
                            title="Combined with static code on copy"
                            className="inline-flex items-center gap-0.5 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300"
                          >
                            <Link2 className="h-3 w-3" />
                            Static
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {item.meta.account}
                      </div>
                    </div>

                    <CountdownRing remaining={rem} total={item.meta.period} />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-mono text-xl font-bold tracking-wider text-zinc-900 dark:text-zinc-100">
                      {staticDisplay && item.meta.staticCodePosition === 'prefix' && (
                        <span className="text-sm text-indigo-600 dark:text-indigo-400">
                          {staticDisplay}
                          {item.meta.staticCodeSeparator}
                        </span>
                      )}
                      <span data-selectable={rev ? 'true' : undefined}>{displayOtp}</span>
                      {staticDisplay && item.meta.staticCodePosition === 'suffix' && (
                        <span className="text-sm text-indigo-600 dark:text-indigo-400">
                          {item.meta.staticCodeSeparator}
                          {staticDisplay}
                        </span>
                      )}
                    </div>

                    {rev?.staticCode && (
                      <button
                        type="button"
                        onClick={() => toggleStaticCode(item.id)}
                        className="text-[11px] font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        {rev.showStaticCode ? 'Hide static' : 'Show static'}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void requestAction(item, 'copy')}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void requestAction(item, 'show')}
                      >
                        {rev ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {rev ? 'Hide' : 'Show'}
                      </Button>
                    </div>

                    <ItemActionsMenu
                      onEdit={() => void requestAction(item, 'edit')}
                      onDelete={() => {
                        void deleteItem(item.id);
                        pushToast(`Deleted "${item.meta.issuer}".`, 'info');
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TotpFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editingItem={editing}
      />

      <ProtectedRevealModal
        challenge={activeChallenge}
        onClose={() => setActiveChallenge(null)}
        onVerified={(grant) => void handleVerified(grant)}
      />
    </div>
  );
}
