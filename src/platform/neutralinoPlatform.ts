import * as Neutralino from '@neutralinojs/lib';
import type { Platform, PlatformOS, SpawnResult } from './platform.ts';

function detectOS(): PlatformOS {
  const nlOs = (globalThis as Record<string, unknown>).NL_OS;
  if (nlOs === 'Windows') return 'windows';
  if (nlOs === 'Darwin') return 'mac';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (ua.includes('Windows')) return 'windows';
  if (ua.includes('Macintosh') || ua.includes('Mac OS')) return 'mac';
  return 'other';
}

function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes('\\') ? '\\' : '/';
  const cleaned = [base.replace(/[\\/]+$/, ''), ...parts.map((p) => p.replace(/^[\\/]+|[\\/]+$/g, ''))];
  return cleaned.filter(Boolean).join(sep);
}

function parentDir(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return idx > 0 ? filePath.slice(0, idx) : '.';
}

function quoteArg(arg: string, os: PlatformOS): string {
  if (/[\r\n\0]/.test(arg)) {
    throw new Error('Command argument contains forbidden control characters.');
  }
  if (os === 'windows') {
    if (!/[\s"&|<>^()%!]/.test(arg)) return arg;
    const escaped = arg
      .replace(/(\\*)"/g, '$1$1\\"')
      .replace(/(\\+)$/, '$1$1')
      .replace(/%/g, '%%');
    return `"${escaped}"`;
  }
  if (!/[\s'"\\$&|;<>()!*?{}[\]]/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * Neutralinojs-backed Platform implementation for Windows and macOS desktop builds.
 */
export class NeutralinoPlatform implements Platform {
  readonly os: PlatformOS;
  readonly isDesktop = true;

  private initialized = false;

  constructor() {
    this.os = detectOS();
  }

  init(): void {
    if (this.initialized) return;
    Neutralino.init();
    this.initialized = true;
  }

  async appDataDir(): Promise<string> {
    const base = await Neutralino.os.getPath('data');
    const dir = joinPath(base, 'AuthNook');
    await this.ensureDir(dir);
    return dir;
  }

  async appBaseDir(): Promise<string> {
    const nlPath = (globalThis as Record<string, unknown>).NL_PATH;
    if (typeof nlPath === 'string' && nlPath.length > 0) {
      return nlPath;
    }
    return '.';
  }

  async exists(path: string): Promise<boolean> {
    try {
      await Neutralino.filesystem.getStats(path);
      return true;
    } catch {
      return false;
    }
  }

  async readFile(path: string): Promise<Uint8Array> {
    const buf = await Neutralino.filesystem.readBinaryFile(path);
    return new Uint8Array(buf);
  }

  async writeFileAtomic(path: string, data: Uint8Array): Promise<void> {
    await this.ensureDir(parentDir(path));
    const rand = new Uint32Array(2);
    globalThis.crypto.getRandomValues(rand);
    const suffix = `${rand[0].toString(36)}${rand[1].toString(36)}`;
    const tmpPath = `${path}.tmp-${Date.now()}-${suffix}`;
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    await Neutralino.filesystem.writeBinaryFile(tmpPath, copy.buffer);
    try {
      await Neutralino.filesystem.move(tmpPath, path);
    } catch (err) {
      await Neutralino.filesystem.remove(tmpPath).catch(() => undefined);
      throw err;
    }
  }

  async remove(path: string): Promise<void> {
    if (await this.exists(path)) {
      await Neutralino.filesystem.remove(path);
    }
  }

  async ensureDir(path: string): Promise<void> {
    if (!(await this.exists(path))) {
      await Neutralino.filesystem.createDirectory(path);
    }
  }

  async clipboardWrite(text: string): Promise<void> {
    try {
      await Neutralino.clipboard.writeText(text);
    } catch {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error('Failed to write to clipboard.');
      }
    }
  }

  async clipboardRead(): Promise<string> {
    return Neutralino.clipboard.readText();
  }

  async clipboardClear(): Promise<void> {
    await Neutralino.clipboard.clear();
  }

  async openFileDialog(options: {
    title: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<string | null> {
    const entries = await Neutralino.os.showOpenDialog(options.title, {
      filters: options.filters,
      multiSelections: false,
    });
    return entries.length > 0 ? entries[0] : null;
  }

  async saveFileDialog(options: {
    title: string;
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<string | null> {
    const selected = await Neutralino.os.showSaveDialog(options.title, {
      defaultPath: options.defaultPath,
      filters: options.filters,
    });
    return selected && selected.length > 0 ? selected : null;
  }

  async spawn(command: string, args: string[], stdin?: string, timeoutMs = 10_000): Promise<SpawnResult> {
    const cmdLine = [quoteArg(command, this.os), ...args.map((a) => quoteArg(a, this.os))].join(' ');
    const proc = await Neutralino.os.spawnProcess(cmdLine);

    return new Promise<SpawnResult>((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let settled = false;

      const cleanup = () => {
        clearTimeout(timer);
        Neutralino.events.off('spawnedProcess', handler);
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        void Neutralino.os.updateSpawnedProcess(proc.id, 'exit').catch(() => undefined);
        reject(new Error(`Process timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const handler = (evt: CustomEvent) => {
        const detail = evt.detail as { id: number; action: string; data: string | number };
        if (detail.id !== proc.id) return;
        if (detail.action === 'stdOut') {
          stdout += String(detail.data);
        } else if (detail.action === 'stdErr') {
          stderr += String(detail.data);
        } else if (detail.action === 'exit') {
          if (settled) return;
          settled = true;
          cleanup();
          resolve({
            exitCode: Number(detail.data),
            stdout,
            stderr,
          });
        }
      };

      void Neutralino.events.on('spawnedProcess', handler);

      void (async () => {
        try {
          if (stdin !== undefined && stdin.length > 0) {
            await Neutralino.os.updateSpawnedProcess(proc.id, 'stdIn', stdin);
          }
          await Neutralino.os.updateSpawnedProcess(proc.id, 'stdInEnd');
        } catch (err) {
          if (!settled) {
            settled = true;
            cleanup();
            reject(err);
          }
        }
      })();
    });
  }

  onWindowBlur(cb: () => void): () => void {
    const handler = () => cb();
    void Neutralino.events.on('windowBlur', handler);
    return () => {
      void Neutralino.events.off('windowBlur', handler);
    };
  }

  onExit(cb: () => void | Promise<void>): () => void {
    const handler = async () => {
      try {
        await cb();
      } finally {
        await Neutralino.app.exit(0);
      }
    };
    void Neutralino.events.on('windowClose', handler);
    return () => {
      void Neutralino.events.off('windowClose', handler);
    };
  }
}
