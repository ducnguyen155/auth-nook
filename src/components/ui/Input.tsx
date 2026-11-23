import { forwardRef, useId, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className = '', id, autoComplete, spellCheck = false, ...rest },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;
  const resolvedAutoComplete =
    autoComplete ?? (rest.type === 'password' ? 'new-password' : 'off');

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        autoComplete={resolvedAutoComplete}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={spellCheck}
        data-form-type="other"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-0 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 ${
          error
            ? 'border-red-500 focus-visible:outline-red-500'
            : 'border-zinc-300 focus:border-indigo-500 focus-visible:outline-indigo-500 dark:border-zinc-700/80'
        } ${className}`}
        {...rest}
      />
      {error && (
        <span id={errorId} className="text-xs text-red-500">
          {error}
        </span>
      )}
      {!error && hint && (
        <span id={hintId} className="text-xs text-zinc-500 dark:text-zinc-400">
          {hint}
        </span>
      )}
    </div>
  );
});
