import type { Platform } from '../../platform/platform.ts';

/**
 * Writes sensitive strings to the OS clipboard and schedules automatic clearing.
 * Only clears the clipboard if it still contains the exact value AuthNook wrote.
 */
export class ClipboardGuard {
  private readonly platform: Platform;
  private lastCopiedValue: string | null = null;
  private clearTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(platform: Platform) {
    this.platform = platform;
  }

  async copySensitive(value: string, ttlSeconds = 30): Promise<void> {
    this.cancelTimer();
    await this.platform.clipboardWrite(value);
    this.lastCopiedValue = value;

    if (ttlSeconds > 0) {
      this.clearTimer = setTimeout(() => {
        void this.clearIfOwned();
      }, ttlSeconds * 1000);
    }
  }

  async clearIfOwned(): Promise<boolean> {
    this.cancelTimer();
    const expected = this.lastCopiedValue;
    this.lastCopiedValue = null;
    if (expected === null) return false;

    try {
      const current = await this.platform.clipboardRead();
      if (current === expected) {
        await this.platform.clipboardClear();
        return true;
      }
    } catch {
      // Ignore clipboard read errors on shutdown or restricted environments.
    }
    return false;
  }

  private cancelTimer(): void {
    if (this.clearTimer) {
      clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }
  }
}
