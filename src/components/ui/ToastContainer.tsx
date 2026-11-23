import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore.ts';

export function ToastContainer() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm shadow-lg ${
            t.kind === 'error'
              ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950 dark:text-red-100'
              : t.kind === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950 dark:text-emerald-100'
              : 'border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100'
          }`}
        >
          {t.kind === 'error' ? (
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
          ) : t.kind === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
          ) : (
            <Info className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden="true" />
          )}
          <span>{t.message}</span>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="ml-1 rounded p-0.5 opacity-60 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
