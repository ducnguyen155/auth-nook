import type { Platform, PlatformOS, SpawnResult } from './platform.ts';

export type MockSpawnHandler = (
  command: string,
  args: string[],
  stdin?: string
) => Promise<SpawnResult> | SpawnResult;

/**
 * In-memory Platform implementation for unit tests and browser preview.
 */
export class MemoryPlatform implements Platform {
  readonly os: PlatformOS;
  readonly isDesktop = false;

  private files = new Map<string, Uint8Array>();
  private clipboard = '';
  private blurListeners = new Set<() => void>();
  private exitListeners = new Set<() => void | Promise<void>>();
  private spawnHandler?: MockSpawnHandler;

  constructor(options?: { os?: PlatformOS; spawnHandler?: MockSpawnHandler }) {
    this.os = options?.os ?? 'other';
    this.spawnHandler = options?.spawnHandler;
  }

  setSpawnHandler(handler: MockSpawnHandler): void {
    this.spawnHandler = handler;
  }

  async appDataDir(): Promise<string> {
    return '/memory/authnook-data';
  }

  async appBaseDir(): Promise<string> {
    return '/memory/authnook-app';
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async readFile(path: string): Promise<Uint8Array> {
    const data = this.files.get(path);
    if (!data) {
      throw new Error(`File not found: ${path}`);
    }
    return new Uint8Array(data);
  }

  async writeFileAtomic(path: string, data: Uint8Array): Promise<void> {
    this.files.set(path, new Uint8Array(data));
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }

  async ensureDir(_path: string): Promise<void> {
    // No-op in memory
  }

  async clipboardWrite(text: string): Promise<void> {
    this.clipboard = text;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall through to execCommand fallback
      }
    }
    if (typeof document !== 'undefined') {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  async clipboardRead(): Promise<string> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      try {
        return await navigator.clipboard.readText();
      } catch {
        // Permission denied or unfocused; fall back to in-memory copy
      }
    }
    return this.clipboard;
  }

  async clipboardClear(): Promise<void> {
    this.clipboard = '';
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText('');
      } catch {
        // Ignore if document is unfocused
      }
    }
  }

  async openFileDialog(): Promise<string | null> {
    return null;
  }

  async saveFileDialog(): Promise<string | null> {
    return null;
  }

  async spawn(command: string, args: string[], stdin?: string): Promise<SpawnResult> {
    if (!this.spawnHandler) {
      throw new Error(`Spawn not configured in MemoryPlatform for: ${command}`);
    }
    return this.spawnHandler(command, args, stdin);
  }

  onWindowBlur(cb: () => void): () => void {
    this.blurListeners.add(cb);
    return () => this.blurListeners.delete(cb);
  }

  onExit(cb: () => void | Promise<void>): () => void {
    this.exitListeners.add(cb);
    return () => this.exitListeners.delete(cb);
  }

  triggerBlur(): void {
    for (const cb of this.blurListeners) cb();
  }

  async triggerExit(): Promise<void> {
    for (const cb of this.exitListeners) await cb();
  }
}
