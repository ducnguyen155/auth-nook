import { describe, expect, it, vi } from 'vitest';
import { MemoryDeviceKeyStore } from '../../platform/deviceKeyStore/memoryStore.ts';
import { MemoryPlatform } from '../../platform/memoryPlatform.ts';
import { decryptEncryptedBackup, exportEncryptedBackup } from '../backup/backupService.ts';
import { generatePassword } from '../generator/passwordGenerator.ts';
import { ClipboardGuard } from '../security/clipboardGuard.ts';
import { VaultService } from '../vault/vaultService.ts';

const TEST_KDF = {
  algorithm: 'argon2id' as const,
  memoryKiB: 1024,
  iterations: 1,
  parallelism: 1,
  hashLength: 32,
};

describe('Password Generator, Encrypted Backup, and ClipboardGuard', () => {
  it('generates passwords matching requested length, character groups, and ambiguous exclusion', () => {
    const pw = generatePassword({
      length: 24,
      uppercase: true,
      lowercase: true,
      digits: true,
      symbols: false,
      excludeAmbiguous: true,
    });
    expect(pw.length).toBe(24);
    expect(/[A-Z]/.test(pw)).toBe(true);
    expect(/[a-z]/.test(pw)).toBe(true);
    expect(/[0-9]/.test(pw)).toBe(true);
    expect(/[0Oo1lI|]/.test(pw)).toBe(false);
  });

  it('exports and decrypts encrypted backups, rejecting wrong passwords or tampered files', async () => {
    const platform = new MemoryPlatform();
    const vault = new VaultService(platform, {
      kdfParams: TEST_KDF,
      deviceKeyStore: new MemoryDeviceKeyStore(),
    });
    await vault.setup('master-pw-123', { deviceBound: false });
    await vault.createPasswordItem(
      { title: 'Email', website: 'https://mail.test', username: 'bob', categoryId: null, tags: [] },
      { password: 'bob-secret-password', notes: '' }
    );

    const bytes = await exportEncryptedBackup(vault, 'backup-pass-999', TEST_KDF);
    const payload = await decryptEncryptedBackup(bytes, 'backup-pass-999');
    expect(payload.passwords).toHaveLength(1);
    expect(payload.passwords[0].secret.password).toBe('bob-secret-password');

    await expect(decryptEncryptedBackup(bytes, 'wrong-backup-pass')).rejects.toThrow();

    const tampered = new Uint8Array(bytes);
    tampered[Math.floor(tampered.length / 2)] ^= 0x01;
    await expect(decryptEncryptedBackup(tampered, 'backup-pass-999')).rejects.toThrow();
  });

  it('clears clipboard after TTL only if clipboard still holds AuthNook value', async () => {
    vi.useFakeTimers();
    try {
      const platform = new MemoryPlatform();
      const guard = new ClipboardGuard(platform);

      await guard.copySensitive('secret-otp-123', 10);
      expect(await platform.clipboardRead()).toBe('secret-otp-123');

      await vi.advanceTimersByTimeAsync(10_000);
      expect(await platform.clipboardRead()).toBe('');

      // If user copies something else before TTL expires, AuthNook does not overwrite it
      await guard.copySensitive('secret-otp-456', 10);
      await platform.clipboardWrite('user-copied-text');
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await platform.clipboardRead()).toBe('user-copied-text');
    } finally {
      vi.useRealTimers();
    }
  });
});
