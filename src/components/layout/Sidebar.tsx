import { KeyRound, ShieldCheck, Settings, Lock } from 'lucide-react';
import { useSessionStore, type NavTab } from '../../stores/sessionStore.ts';
import { Button } from '../ui/Button.tsx';

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: typeof KeyRound }> = [
  { id: 'passwords', label: 'Passwords', icon: KeyRound },
  { id: 'authenticator', label: 'Authenticator', icon: ShieldCheck },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const { activeTab, setActiveTab, lock } = useSessionStore();

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-zinc-200 bg-zinc-100/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="mb-5 flex items-center gap-2.5 px-2 pt-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            AuthNook
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Local Vault</div>
        </div>
      </div>

      <nav aria-label="Primary" className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                active
                  ? 'bg-white text-indigo-600 shadow-xs dark:bg-zinc-800 dark:text-indigo-400'
                  : 'text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <Button
          variant="ghost"
          className="w-full justify-start text-zinc-600 dark:text-zinc-400"
          onClick={() => void lock()}
        >
          <Lock className="h-4 w-4" />
          Lock Vault
        </Button>
      </div>
    </aside>
  );
}
