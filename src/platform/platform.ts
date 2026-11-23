export type PlatformOS = 'windows' | 'mac' | 'other';

export interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class DeviceKeyUnavailableError extends Error {
  constructor(message = 'Device key is unavailable. This vault may belong to another device or user account.') {
    super(message);
    this.name = 'DeviceKeyUnavailableError';
  }
}

export class HelperIntegrityError extends Error {
  constructor(message = 'Native helper integrity check failed.') {
    super(message);
    this.name = 'HelperIntegrityError';
  }
}

/**
 * Abstract platform adapter isolating all native OS operations (filesystem,
 * clipboard, file dialogs, process execution, and window lifecycle events).
 */
export interface Platform {
  readonly os: PlatformOS;
  readonly isDesktop: boolean;

  appDataDir(): Promise<string>;
  appBaseDir(): Promise<string>;

  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<Uint8Array>;
  writeFileAtomic(path: string, data: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  ensureDir(path: string): Promise<void>;

  clipboardWrite(text: string): Promise<void>;
  clipboardRead(): Promise<string>;
  clipboardClear(): Promise<void>;

  openFileDialog(options: { title: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null>;
  saveFileDialog(options: { title: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null>;

  spawn(command: string, args: string[], stdin?: string, timeoutMs?: number): Promise<SpawnResult>;

  onWindowBlur(cb: () => void): () => void;
  onExit(cb: () => void | Promise<void>): () => void;
}
