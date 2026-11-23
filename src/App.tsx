import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { ToastContainer } from './components/ui/ToastContainer.tsx';
import { AuthenticatorView } from './features/authenticator/AuthenticatorView.tsx';
import { PasswordsView } from './features/passwords/PasswordsView.tsx';
import { SettingsView } from './features/settings/SettingsView.tsx';
import { SetupView } from './features/setup/SetupView.tsx';
import { UnlockView } from './features/unlock/UnlockView.tsx';
import { useSessionStore } from './stores/sessionStore.ts';
import { useSettingsStore } from './stores/settingsStore.ts';

export function App() {
  const { status, activeTab, deviceBound, setActiveTab, init } = useSessionStore();
  const { settings, updateSettings } = useSettingsStore();

  useEffect(() => {
    void init();
  }, [init]);

  const needsBackupReminder =
    status === 'unlocked' &&
    deviceBound &&
    !settings.backupReminderDismissed &&
    settings.lastBackupAt === null;

  return (
    <div className="h-full w-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {status === 'loading' && (
        <div className="flex h-full items-center justify-center text-sm text-zinc-500">
          Loading vault...
        </div>
      )}

      {status === 'uninitialized' && <SetupView />}
      {status === 'locked' && <UnlockView />}

      {status === 'unlocked' && (
        <div className="flex h-full">
          <Sidebar />
          <main className="flex flex-1 flex-col overflow-hidden py-4 pl-5 pr-1.5">
            {needsBackupReminder && activeTab !== 'settings' && (
              <div className="mb-3 mr-2.5 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>
                    Device binding is enabled. Export an encrypted backup so you can recover if you change devices.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void updateSettings({ backupReminderDismissed: true });
                    setActiveTab('settings');
                  }}
                  className="shrink-0 font-semibold underline"
                >
                  Backup now
                </button>
              </div>
            )}

            <div className="min-h-0 flex-1">
              {activeTab === 'passwords' && <PasswordsView />}
              {activeTab === 'authenticator' && <AuthenticatorView />}
              {activeTab === 'settings' && <SettingsView />}
            </div>
          </main>
        </div>
      )}

      <ToastContainer />
    </div>
  );
}
