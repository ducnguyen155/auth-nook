import { useEffect, useState, type FormEvent } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button } from './Button.tsx';
import { Input } from './Input.tsx';
import { Modal } from './Modal.tsx';
import type { RevealChallenge, RevealGrant } from '../../core/reveal/revealEngine.ts';
import { revealEngine } from '../../core/runtime.ts';

interface ProtectedRevealModalProps {
  challenge: RevealChallenge | null;
  targetLabel?: string;
  onClose: () => void;
  onVerified: (grant: RevealGrant) => void;
}

export function ProtectedRevealModal({
  challenge,
  targetLabel = 'this item',
  onClose,
  onVerified,
}: ProtectedRevealModalProps) {
  const [charInput, setCharInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (challenge) {
      setCharInput('');
      setError(null);
      setBusy(false);
    }
  }, [challenge]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!challenge || charInput.length !== 1) return;

    setBusy(true);
    setError(null);
    try {
      const result = await revealEngine.verify(challenge.challengeId, charInput);
      if (result.ok) {
        onVerified(result.grant);
        return;
      }
      if (result.locked) {
        onClose();
        return;
      }
      if (result.reason === 'expired') {
        setError('Challenge expired. Please close and try again.');
      } else {
        setError(
          `Incorrect digit. ${result.remainingAttempts} ${
            result.remainingAttempts === 1 ? 'attempt' : 'attempts'
          } remaining before vault locks.`
        );
      }
      setCharInput('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={challenge !== null} onClose={onClose} title="Protected Reveal">
      {challenge && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex items-start gap-2.5 rounded-lg bg-indigo-50 p-3 text-xs text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
            <div>
              Enter character{' '}
              <strong className="font-bold">#{challenge.displayIndex}</strong> of your Passkey to{' '}
              {challenge.action === 'copy'
                ? 'copy'
                : challenge.action === 'edit'
                  ? 'edit'
                  : 'reveal'}{' '}
              {targetLabel}.
            </div>
          </div>

          <Input
            label={`Passkey Character #${challenge.displayIndex}`}
            type="password"
            inputMode="numeric"
            maxLength={1}
            autoFocus
            value={charInput}
            onChange={(e) => setCharInput(e.target.value.slice(0, 1))}
            placeholder="1 digit"
            required
          />

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/60 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || charInput.length !== 1}>
              Verify
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
