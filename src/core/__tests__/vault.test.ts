import { describe, expect, it } from 'vitest';
import { MemoryDeviceKeyStore } from '../../platform/deviceKeyStore/memoryStore.ts';
import { MemoryPlatform } from '../../platform/memoryPlatform.ts';
import { DeviceKeyUnavailableError } from '../../platform/platform.ts';
import { decryptEncryptedBackup, exportEncryptedBackup } from '../backup/backupService.ts';
import { DecryptionError } from '../crypto/aead.ts';
import { VaultDatabase } from '../db/database.ts';
import { InvalidMasterPasswordError, VaultService } from '../vault/vaultService.ts';

const TEST_KDF = {
  algorithm: 'argon2id' as const,
  memoryKiB: 1024,
  iterations: 1,
  parallelism: 1,
  hashLength: 32,
};

function bytesContainAscii(haystack: Uint8Array, needle: string): boolean {
  const text = new TextDecoder('latin1').decode(haystack);
  return text.includes(needle);
}

describe('VaultService & Device Binding', () => {
  it('supports setup, lock, unlock, master password change, and stores no plaintext secrets in SQLite', async () => {
    const platform = new MemoryPlatform();
    const deviceStore = new MemoryDeviceKeyStore();
    const vault = new VaultService(platform, { kdfParams: TEST_KDF, deviceKeyStore: deviceStore });

    await vault.setup('correct-master-pw', { deviceBound: true });
    expect(await vault.isInitialized()).toBe(true);
    expect(vault.isUnlocked()).toBe(true);

    const pwItem = await vault.createPasswordItem(
      {
        title: 'GitHub',
        website: 'https://github.com',
        username: 'alice@example.com',
        categoryId: null,
        tags: ['dev'],
      },
      {
        password: 'UNIQUE_PLAINTEXT_PASSWORD_9911',
        notes: 'UNIQUE_SECRET_NOTE_7722',
      }
    );

    const totpItem = await vault.createTotpItem(
      {
        issuer: 'CorpVPN',
        account: 'alice@corp.local',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        hasStaticCode: true,
        staticCodePosition: 'prefix',
        staticCodeSeparator: '',
      },
      {
        secret: 'JBSWY3DPEHPK3PXP',
        staticCode: 'UNIQUE_STATIC_PIN_4455',
      }
    );

    await vault.lock();
    expect(vault.isUnlocked()).toBe(false);

    // Inspect raw SQLite file bytes for any plaintext leaks
    const dbBytes = await platform.readFile('/memory/authnook-data/authnook.db');
    expect(bytesContainAscii(dbBytes, 'UNIQUE_PLAINTEXT_PASSWORD_9911')).toBe(false);
    expect(bytesContainAscii(dbBytes, 'UNIQUE_SECRET_NOTE_7722')).toBe(false);
    expect(bytesContainAscii(dbBytes, 'JBSWY3DPEHPK3PXP')).toBe(false);
    expect(bytesContainAscii(dbBytes, 'UNIQUE_STATIC_PIN_4455')).toBe(false);
    expect(bytesContainAscii(dbBytes, 'alice@example.com')).toBe(false);

    // Wrong password rejected
    await expect(vault.unlock('wrong-master-pw')).rejects.toThrow(InvalidMasterPasswordError);

    // Correct password unlocks
    await vault.unlock('correct-master-pw');
    expect(vault.readPasswordSecret(pwItem.id).password).toBe('UNIQUE_PLAINTEXT_PASSWORD_9911');
    expect(vault.readTotpSecret(totpItem.id).staticCode).toBe('UNIQUE_STATIC_PIN_4455');

    // Change master password
    await vault.changeMasterPassword('correct-master-pw', 'new-master-pw-2026');
    await vault.lock();
    await expect(vault.unlock('correct-master-pw')).rejects.toThrow(InvalidMasterPasswordError);
    await vault.unlock('new-master-pw-2026');
    expect(vault.listItems().length).toBe(2);

    // Changing passkey requires verifying the Master Password
    await expect(
      vault.setPasskeyWithMasterPassword('wrong-master-pw', { length: 4, hashes: ['a', 'b', 'c', 'd'] })
    ).rejects.toThrow(InvalidMasterPasswordError);
    await vault.setPasskeyWithMasterPassword('new-master-pw-2026', {
      length: 4,
      hashes: ['a', 'b', 'c', 'd'],
    });
    expect(vault.getPasskeyRecord()?.length).toBe(4);
  });

  it('blocks unlock when device key is missing or belongs to another machine, but restores via backup', async () => {
    const platformA = new MemoryPlatform();
    const storeA = new MemoryDeviceKeyStore();
    const vaultA = new VaultService(platformA, { kdfParams: TEST_KDF, deviceKeyStore: storeA });

    await vaultA.setup('shared-master-pw', { deviceBound: true });
    await vaultA.createTotpItem(
      {
        issuer: 'Bank',
        account: 'user',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        hasStaticCode: true,
        staticCodePosition: 'prefix',
        staticCodeSeparator: '-',
      },
      { secret: 'JBSWY3DPEHPK3PXP', staticCode: 'AAA' }
    );

    const backupBytes = await exportEncryptedBackup(vaultA, 'backup-pw-123', TEST_KDF);
    await vaultA.lock();

    // Copy raw authnook.db to "Machine B" with a fresh DeviceKeyStore
    const dbBytes = await platformA.readFile('/memory/authnook-data/authnook.db');
    const platformB = new MemoryPlatform();
    await platformB.writeFileAtomic('/memory/authnook-data/authnook.db', dbBytes);
    const storeB = new MemoryDeviceKeyStore();
    const vaultB = new VaultService(platformB, { kdfParams: TEST_KDF, deviceKeyStore: storeB });

    // Even with the exact Master Password, Machine B cannot unlock
    await expect(vaultB.unlock('shared-master-pw')).rejects.toThrow(DeviceKeyUnavailableError);

    // Restore from backup succeeds on Machine B
    const payload = await decryptEncryptedBackup(backupBytes, 'backup-pw-123');
    await vaultB.restoreFromPlainPayload(payload, 'new-pw-on-b', { deviceBound: true });
    await vaultB.lock();
    await vaultB.unlock('new-pw-on-b');

    const items = vaultB.listItems();
    expect(items).toHaveLength(1);
    expect(vaultB.readTotpSecret(items[0].id).staticCode).toBe('AAA');
  });

  it('detects deleted passkey_ct, reveal_state_ct, or settings_ct metadata rows', async () => {
    for (const metaKey of ['passkey_ct', 'reveal_state_ct', 'settings_ct'] as const) {
      const platform = new MemoryPlatform();
      const vault = new VaultService(platform, {
        kdfParams: TEST_KDF,
        deviceKeyStore: new MemoryDeviceKeyStore(),
      });
      await vault.setup('master-pw-123', { deviceBound: false });
      await vault.lock();

      const db = await VaultDatabase.openOrCreate(platform, '/memory/authnook-data/authnook.db');
      db.deleteMeta(metaKey);
      await db.flush();
      await db.close();

      await vault.unlock('master-pw-123');
      if (metaKey === 'passkey_ct') {
        expect(() => vault.getPasskeyRecord()).toThrow(DecryptionError);
      } else if (metaKey === 'reveal_state_ct') {
        expect(() => vault.getRevealState()).toThrow(DecryptionError);
      } else {
        expect(() => vault.getSettings()).toThrow(DecryptionError);
      }
      await vault.lock();
    }
  });

  it('locks the vault after 3 consecutive failed verifyMasterPassword attempts', async () => {
    const platform = new MemoryPlatform();
    const vault = new VaultService(platform, {
      kdfParams: TEST_KDF,
      deviceKeyStore: new MemoryDeviceKeyStore(),
    });
    await vault.setup('master-pw-123', { deviceBound: false });

    await expect(vault.verifyMasterPassword('wrong-1')).rejects.toThrow(InvalidMasterPasswordError);
    expect(vault.isUnlocked()).toBe(true);

    await expect(vault.verifyMasterPassword('wrong-2')).rejects.toThrow(InvalidMasterPasswordError);
    expect(vault.isUnlocked()).toBe(true);

    await expect(vault.verifyMasterPassword('wrong-3')).rejects.toThrow(InvalidMasterPasswordError);
    expect(vault.isUnlocked()).toBe(false);
  });

  it('preserves passkey configuration across backup export/restore and backs up overwritten vault', async () => {
    const platformA = new MemoryPlatform();
    const vaultA = new VaultService(platformA, {
      kdfParams: TEST_KDF,
      deviceKeyStore: new MemoryDeviceKeyStore(),
    });
    await vaultA.setup('master-pw-a', { deviceBound: false });
    const passkeyRecord = { length: 4, hashes: ['h0', 'h1', 'h2', 'h3'] };
    await vaultA.setPasskeyRecord(passkeyRecord);

    const backupBytes = await exportEncryptedBackup(vaultA, 'backup-pw-123', TEST_KDF);
    const payload = await decryptEncryptedBackup(backupBytes, 'backup-pw-123');

    const platformB = new MemoryPlatform();
    const vaultB = new VaultService(platformB, {
      kdfParams: TEST_KDF,
      deviceKeyStore: new MemoryDeviceKeyStore(),
    });
    await vaultB.setup('old-pw-b', { deviceBound: false });
    await vaultB.lock();

    await vaultB.restoreFromPlainPayload(payload, 'new-pw-b', { deviceBound: false });
    expect(await platformB.exists('/memory/authnook-data/authnook.db.bak')).toBe(true);

    await vaultB.lock();
    await vaultB.unlock('new-pw-b');
    expect(vaultB.getPasskeyRecord()).toEqual(passkeyRecord);
  });
});
