import { useState } from 'react';
import { RefreshCw, Check } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { Modal } from '../../components/ui/Modal.tsx';
import {
  DEFAULT_GENERATOR_OPTIONS,
  estimateEntropyBits,
  generatePassword,
  type GeneratorOptions,
} from '../../core/generator/passwordGenerator.ts';

interface PasswordGeneratorModalProps {
  open: boolean;
  onClose: () => void;
  onUsePassword?: (password: string) => void;
}

export function PasswordGeneratorModal({
  open,
  onClose,
  onUsePassword,
}: PasswordGeneratorModalProps) {
  const [options, setOptions] = useState<GeneratorOptions>(DEFAULT_GENERATOR_OPTIONS);
  const [generated, setGenerated] = useState<string>(() =>
    generatePassword(DEFAULT_GENERATOR_OPTIONS)
  );

  const regenerate = (nextOptions: GeneratorOptions = options) => {
    try {
      setGenerated(generatePassword(nextOptions));
    } catch {
      // Keep last valid password if user temporarily unchecks all options.
    }
  };

  const updateOption = <K extends keyof GeneratorOptions>(key: K, value: GeneratorOptions[K]) => {
    const next = { ...options, [key]: value };
    setOptions(next);
    regenerate(next);
  };

  const entropy = estimateEntropyBits(options);
  const hasAnyGroup =
    options.uppercase || options.lowercase || options.digits || options.symbols;

  return (
    <Modal open={open} onClose={onClose} title="Password Generator">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
          <code
            data-selectable="true"
            className="flex-1 break-all font-mono text-sm text-zinc-900 dark:text-zinc-100"
          >
            {generated}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => regenerate()}
            title="Regenerate"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              Length: {options.length}
            </span>
            <span className="text-zinc-500 dark:text-zinc-400">~{entropy} bits entropy</span>
          </div>
          <input
            type="range"
            min={8}
            max={64}
            value={options.length}
            onChange={(e) => updateOption('length', Number(e.target.value))}
            className="accent-indigo-600"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-700 dark:text-zinc-300">
          {(
            [
              ['uppercase', 'Uppercase (A-Z)'],
              ['lowercase', 'Lowercase (a-z)'],
              ['digits', 'Digits (0-9)'],
              ['symbols', 'Symbols (!@#$)'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={options[key]}
                onChange={(e) => updateOption(key, e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-indigo-600"
              />
              {label}
            </label>
          ))}
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={options.excludeAmbiguous}
            onChange={(e) => updateOption('excludeAmbiguous', e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-indigo-600"
          />
          Exclude ambiguous characters (0, O, o, 1, l, I, |)
        </label>

        {!hasAnyGroup && (
          <p className="text-xs text-red-500">Select at least one character group.</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          {onUsePassword && (
            <Button
              type="button"
              disabled={!hasAnyGroup}
              onClick={() => {
                onUsePassword(generated);
                onClose();
              }}
            >
              <Check className="h-4 w-4" />
              Use Password
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
