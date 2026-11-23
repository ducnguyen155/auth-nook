/**
 * Tracks user activity and locks the vault after an idle timeout.
 */
export class AutoLockController {
  private readonly onLock: () => void | Promise<void>;
  private timeoutMinutes = 5;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastActivity = Date.now();
  private running = false;

  private readonly activityHandler = () => {
    const now = Date.now();
    // Throttle timer resets to once per second to avoid churn on mousemove.
    if (now - this.lastActivity < 1000) return;
    this.lastActivity = now;
    this.resetTimer();
  };

  constructor(onLock: () => void | Promise<void>) {
    this.onLock = onLock;
  }

  start(timeoutMinutes: number): void {
    this.timeoutMinutes = timeoutMinutes;
    if (!this.running && typeof window !== 'undefined') {
      window.addEventListener('mousemove', this.activityHandler, { passive: true });
      window.addEventListener('keydown', this.activityHandler, { passive: true });
      window.addEventListener('pointerdown', this.activityHandler, { passive: true });
      this.running = true;
    }
    this.lastActivity = Date.now();
    this.resetTimer();
  }

  updateTimeout(timeoutMinutes: number): void {
    this.timeoutMinutes = timeoutMinutes;
    this.resetTimer();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.running && typeof window !== 'undefined') {
      window.removeEventListener('mousemove', this.activityHandler);
      window.removeEventListener('keydown', this.activityHandler);
      window.removeEventListener('pointerdown', this.activityHandler);
      this.running = false;
    }
  }

  private resetTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.timeoutMinutes <= 0) return;
    const ms = this.timeoutMinutes * 60_000;
    this.timer = setTimeout(() => {
      void this.onLock();
    }, ms);
  }
}
