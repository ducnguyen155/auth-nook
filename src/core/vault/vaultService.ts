import type { Platform } from '../../platform/platform.ts';
import { createDeviceKeyStore, type DeviceKeyStore } from '../../platform/deviceKeyStore/index.ts';
import { DecryptionError, openJson, sealJson, zeroize } from '../crypto/aead.ts';
import { base64ToBytes, bytesToBase64, utf8ToBytes } from '../crypto/encoding.ts';
import {
  DEFAULT_KDF_PARAMS,
  derivePasswordKey,
  validateKdfParams,
  type KdfParams,
} from '../crypto/kdf.ts';
import { deriveKek, derivePasskeyKey, deriveSecretFieldKey, unwrapDek, wrapDek } from '../crypto/keys.ts';
import { randomBytes, randomUuid } from '../crypto/random.ts';
import { VaultDatabase } from '../db/database.ts';
import {
  DEFAULT_VAULT_SETTINGS,
  type BackupPlainPayload,
  type CategoryItem,
  type PasskeyRecord,
  type PasswordMeta,
  type PasswordSecret,
  type RevealStateRecord,
  type TotpMeta,
  type TotpSecret,
  type VaultItemSummary,
  type VaultSettings,
} from './types.ts';

function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes('\\') ? '\\' : '/';
  return [base.replace(/[\\/]+$/, ''), ...parts.map((p) => p.replace(/^[\\/]+|[\\/]+$/g, ''))]
    .filter(Boolean)
    .join(sep);
}

function itemAad(id: string, type: string, layer: 'meta' | 'secret'): Uint8Array {
  return utf8ToBytes(`authnook/item/${id}/${type}/${layer}`);
}

function metaRecordAad(key: string): Uint8Array {
  return utf8ToBytes(`authnook/meta/${key}`);
}

function categoryAad(id: string): Uint8Array {
  return utf8ToBytes(`authnook/category/${id}`);
}

export class VaultLockedError extends Error {
  constructor() {
    super('Vault is locked.');
    this.name = 'VaultLockedError';
  }
}

export class InvalidMasterPasswordError extends Error {
  constructor() {
    super('Invalid master password.');
    this.name = 'InvalidMasterPasswordError';
  }
}

export interface VaultServiceOptions {
  kdfParams?: KdfParams;
  deviceKeyStore?: DeviceKeyStore;
  dbFileName?: string;
}

/**
 * Core vault service managing encryption keys, SQLite persistence,
 * two-layer item encryption, categories, passkey records, and backup export/restore.
 */
export class VaultService {
  private readonly platform: Platform;
  private readonly deviceKeyStore: DeviceKeyStore;
  private readonly kdfParams: KdfParams;
  private readonly dbFileName: string;

  private db: VaultDatabase | null = null;
  private dek: Uint8Array | null = null;
  private secretKey: Uint8Array | null = null;
  private passkeyKey: Uint8Array | null = null;
  private failedUnlockCount = 0;
  private unlockBlockedUntil = 0;
  private failedReauthCount = 0;
  private lockListeners = new Set<() => void>();

  constructor(platform: Platform, options?: VaultServiceOptions) {
    this.platform = platform;
    this.deviceKeyStore = options?.deviceKeyStore ?? createDeviceKeyStore(platform);
    this.kdfParams = options?.kdfParams ?? DEFAULT_KDF_PARAMS;
    this.dbFileName = options?.dbFileName ?? 'authnook.db';
  }

  private async dbPath(): Promise<string> {
    const dir = await this.platform.appDataDir();
    return joinPath(dir, this.dbFileName);
  }

  isDeviceBindingSupported(): boolean {
    return this.deviceKeyStore.isSupported();
  }

  isUnlocked(): boolean {
    return this.dek !== null && this.db !== null;
  }

  onLock(cb: () => void): () => void {
    this.lockListeners.add(cb);
    return () => this.lockListeners.delete(cb);
  }

  async isInitialized(): Promise<boolean> {
    const path = await this.dbPath();
    if (!(await this.platform.exists(path))) {
      return false;
    }
    const db = await VaultDatabase.openOrCreate(this.platform, path);
    try {
      return db.getMeta('wrapped_dek') !== null;
    } finally {
      await db.close();
    }
  }

  async isDeviceBound(): Promise<boolean> {
    if (this.db) {
      return this.db.getMetaString('device_bound') === '1';
    }
    const path = await this.dbPath();
    if (!(await this.platform.exists(path))) return false;
    const db = await VaultDatabase.openOrCreate(this.platform, path);
    try {
      return db.getMetaString('device_bound') === '1';
    } finally {
      await db.close();
    }
  }

  async setup(masterPassword: string, options?: { deviceBound?: boolean }): Promise<void> {
    if (masterPassword.length < 8) {
      throw new Error('Master password must be at least 8 characters.');
    }

    const bindDevice = options?.deviceBound ?? this.deviceKeyStore.isSupported();
    if (bindDevice && !this.deviceKeyStore.isSupported()) {
      throw new Error('Device binding is not supported on this platform.');
    }

    const dir = await this.platform.appDataDir();
    const path = joinPath(dir, this.dbFileName);
    const deviceKeyPath = joinPath(dir, 'device.key');
    const vaultId = randomUuid();
    const salt = randomBytes(16);
    const dek = randomBytes(32);

    let pwk: Uint8Array | null = null;
    let deviceSecret: Uint8Array | undefined;
    let kek: Uint8Array | null = null;

    try {
      pwk = await derivePasswordKey(masterPassword, salt, this.kdfParams);

      if (await this.platform.exists(path)) {
        await this.platform.writeFileAtomic(`${path}.bak`, await this.platform.readFile(path));
      }
      if (await this.platform.exists(deviceKeyPath)) {
        await this.platform.writeFileAtomic(
          `${deviceKeyPath}.bak`,
          await this.platform.readFile(deviceKeyPath)
        );
      }

      if (bindDevice) {
        deviceSecret = await this.deviceKeyStore.create(vaultId);
      }
      kek = deriveKek(pwk, deviceSecret);
      const wrappedDek = wrapDek(kek, dek);

      if (this.db) {
        await this.db.close();
      }
      const db = await VaultDatabase.createFresh(this.platform, path);
      db.setMetaString('vault_id', vaultId);
      db.setMetaString('kdf_params', JSON.stringify(this.kdfParams));
      db.setMetaString('kdf_salt', bytesToBase64(salt));
      db.setMetaString('device_bound', bindDevice ? '1' : '0');
      db.setMeta('wrapped_dek', wrappedDek);
      db.setMeta('settings_ct', sealJson(dek, DEFAULT_VAULT_SETTINGS, metaRecordAad('settings_ct')));
      db.setMeta('passkey_ct', sealJson<PasskeyRecord | null>(dek, null, metaRecordAad('passkey_ct')));

      const initialReveal: RevealStateRecord = { failedAttempts: 0, lastIndex: null };
      db.setMeta('reveal_state_ct', sealJson(dek, initialReveal, metaRecordAad('reveal_state_ct')));

      await db.flush();

      this.failedUnlockCount = 0;
      this.unlockBlockedUntil = 0;
      this.failedReauthCount = 0;
      this.db = db;
      this.setSessionKeys(dek);
    } catch (err) {
      zeroize(dek);
      throw err;
    } finally {
      zeroize(pwk, deviceSecret, kek);
    }
  }

  async unlock(masterPassword: string): Promise<void> {
    const now = Date.now();
    if (now < this.unlockBlockedUntil) {
      const waitSec = Math.ceil((this.unlockBlockedUntil - now) / 1000);
      throw new Error(`Too many failed attempts. Please wait ${waitSec}s.`);
    }

    const path = await this.dbPath();
    const db = await VaultDatabase.openOrCreate(this.platform, path);

    let pwk: Uint8Array | null = null;
    let deviceSecret: Uint8Array | undefined;
    let kek: Uint8Array | null = null;

    try {
      const vaultId = db.getMetaString('vault_id');
      const kdfRaw = db.getMetaString('kdf_params');
      const saltB64 = db.getMetaString('kdf_salt');
      const wrappedDek = db.getMeta('wrapped_dek');
      const deviceBound = db.getMetaString('device_bound') === '1';

      if (!vaultId || !kdfRaw || !saltB64 || !wrappedDek) {
        throw new Error('Vault is not initialized.');
      }

      const kdfParams = validateKdfParams(JSON.parse(kdfRaw));
      const salt = base64ToBytes(saltB64);

      if (deviceBound) {
        deviceSecret = await this.deviceKeyStore.load(vaultId);
      }

      pwk = await derivePasswordKey(masterPassword, salt, kdfParams);
      kek = deriveKek(pwk, deviceSecret);

      let dek: Uint8Array;
      try {
        dek = unwrapDek(kek, wrappedDek);
      } catch {
        this.failedUnlockCount += 1;
        if (this.failedUnlockCount >= 3) {
          const backoffMs = Math.min(30_000, 1000 * 2 ** (this.failedUnlockCount - 3));
          this.unlockBlockedUntil = Date.now() + backoffMs;
        }
        await db.close();
        throw new InvalidMasterPasswordError();
      }

      this.failedUnlockCount = 0;
      this.unlockBlockedUntil = 0;
      this.failedReauthCount = 0;
      this.db = db;
      this.setSessionKeys(dek);
    } catch (err) {
      if (this.db !== db) {
        await db.close().catch(() => undefined);
      }
      throw err;
    } finally {
      zeroize(pwk, deviceSecret, kek);
    }
  }

  async lock(): Promise<void> {
    this.failedReauthCount = 0;
    zeroize(this.dek, this.secretKey, this.passkeyKey);
    this.dek = null;
    this.secretKey = null;
    this.passkeyKey = null;

    if (this.db) {
      await this.db.close();
      this.db = null;
    }

    for (const cb of this.lockListeners) {
      cb();
    }
  }

  async changeMasterPassword(currentPassword: string, newPassword: string): Promise<void> {
    const { db, dek } = this.requireUnlocked();
    if (newPassword.length < 8) {
      throw new Error('New master password must be at least 8 characters.');
    }

    const vaultId = db.getMetaString('vault_id')!;
    const kdfParams = validateKdfParams(JSON.parse(db.getMetaString('kdf_params')!));
    const oldSalt = base64ToBytes(db.getMetaString('kdf_salt')!);
    const wrappedDek = db.getMeta('wrapped_dek')!;
    const deviceBound = db.getMetaString('device_bound') === '1';

    let deviceSecret: Uint8Array | undefined;
    let oldPwk: Uint8Array | null = null;
    let oldKek: Uint8Array | null = null;
    let newPwk: Uint8Array | null = null;
    let newKek: Uint8Array | null = null;

    try {
      if (deviceBound) {
        deviceSecret = await this.deviceKeyStore.load(vaultId);
      }
      oldPwk = await derivePasswordKey(currentPassword, oldSalt, kdfParams);
      oldKek = deriveKek(oldPwk, deviceSecret);
      let verifiedDek: Uint8Array | null = null;
      try {
        verifiedDek = unwrapDek(oldKek, wrappedDek);
      } catch {
        this.failedReauthCount += 1;
        if (this.failedReauthCount >= 3) {
          this.failedReauthCount = 0;
          await this.lock();
        }
        throw new InvalidMasterPasswordError();
      } finally {
        zeroize(verifiedDek);
      }
      this.failedReauthCount = 0;

      const newSalt = randomBytes(16);
      newPwk = await derivePasswordKey(newPassword, newSalt, this.kdfParams);
      newKek = deriveKek(newPwk, deviceSecret);
      const newWrapped = wrapDek(newKek, dek);

      db.setMetaString('kdf_params', JSON.stringify(this.kdfParams));
      db.setMetaString('kdf_salt', bytesToBase64(newSalt));
      db.setMeta('wrapped_dek', newWrapped);
      await db.flush();
    } finally {
      zeroize(deviceSecret, oldPwk, oldKek, newPwk, newKek);
    }
  }

  getPasskeyKey(): Uint8Array {
    if (!this.passkeyKey) throw new VaultLockedError();
    return this.passkeyKey;
  }

  getPasskeyRecord(): PasskeyRecord | null {
    const { db, dek } = this.requireUnlocked();
    const ct = db.getMeta('passkey_ct');
    if (!ct) {
      throw new DecryptionError('Missing passkey metadata record.');
    }
    return openJson<PasskeyRecord | null>(dek, ct, metaRecordAad('passkey_ct'));
  }

  async setPasskeyRecord(record: PasskeyRecord | null): Promise<void> {
    const { db, dek } = this.requireUnlocked();
    db.setMeta('passkey_ct', sealJson<PasskeyRecord | null>(dek, record, metaRecordAad('passkey_ct')));
    await db.flush();
  }

  /**
   * Verifies the Master Password against the unlocked vault before allowing
   * sensitive security changes (such as updating or removing the Passkey).
   */
  async verifyMasterPassword(masterPassword: string): Promise<void> {
    const { db } = this.requireUnlocked();
    const vaultId = db.getMetaString('vault_id')!;
    const kdfParams = validateKdfParams(JSON.parse(db.getMetaString('kdf_params')!));
    const salt = base64ToBytes(db.getMetaString('kdf_salt')!);
    const wrappedDek = db.getMeta('wrapped_dek')!;
    const deviceBound = db.getMetaString('device_bound') === '1';

    let deviceSecret: Uint8Array | undefined;
    let pwk: Uint8Array | null = null;
    let kek: Uint8Array | null = null;
    let verifiedDek: Uint8Array | null = null;

    try {
      if (deviceBound) {
        deviceSecret = await this.deviceKeyStore.load(vaultId);
      }
      pwk = await derivePasswordKey(masterPassword, salt, kdfParams);
      kek = deriveKek(pwk, deviceSecret);
      try {
        verifiedDek = unwrapDek(kek, wrappedDek);
      } catch {
        this.failedReauthCount += 1;
        if (this.failedReauthCount >= 3) {
          this.failedReauthCount = 0;
          await this.lock();
        }
        throw new InvalidMasterPasswordError();
      }
      this.failedReauthCount = 0;
    } finally {
      zeroize(deviceSecret, pwk, kek, verifiedDek);
    }
  }

  async setPasskeyWithMasterPassword(
    masterPassword: string,
    record: PasskeyRecord | null
  ): Promise<void> {
    await this.verifyMasterPassword(masterPassword);
    await this.setPasskeyRecord(record);
  }

  getRevealState(): RevealStateRecord {
    const { db, dek } = this.requireUnlocked();
    const ct = db.getMeta('reveal_state_ct');
    if (!ct) {
      throw new DecryptionError('Missing vault metadata record.');
    }
    return openJson<RevealStateRecord>(dek, ct, metaRecordAad('reveal_state_ct'));
  }

  async setRevealState(state: RevealStateRecord): Promise<void> {
    const { db, dek } = this.requireUnlocked();
    db.setMeta('reveal_state_ct', sealJson(dek, state, metaRecordAad('reveal_state_ct')));
    await db.flush();
  }

  getSettings(): VaultSettings {
    const { db, dek } = this.requireUnlocked();
    const ct = db.getMeta('settings_ct');
    if (!ct) {
      throw new DecryptionError('Missing vault metadata record.');
    }
    return { ...DEFAULT_VAULT_SETTINGS, ...openJson<Partial<VaultSettings>>(dek, ct, metaRecordAad('settings_ct')) };
  }

  async updateSettings(patch: Partial<VaultSettings>): Promise<VaultSettings> {
    const { db, dek } = this.requireUnlocked();
    const next = { ...this.getSettings(), ...patch };
    db.setMeta('settings_ct', sealJson(dek, next, metaRecordAad('settings_ct')));
    await db.flush();
    return next;
  }

  listItems(): VaultItemSummary[] {
    const { db, dek } = this.requireUnlocked();
    const rows = db.listItems();
    return rows.map((row) => {
      if (row.type === 'password') {
        const meta = openJson<PasswordMeta>(dek, row.meta_ct, itemAad(row.id, 'password', 'meta'));
        return {
          id: row.id,
          type: 'password',
          meta,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }
      const meta = openJson<TotpMeta>(dek, row.meta_ct, itemAad(row.id, 'totp', 'meta'));
      return {
        id: row.id,
        type: 'totp',
        meta,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  async createPasswordItem(meta: PasswordMeta, secret: PasswordSecret): Promise<VaultItemSummary> {
    const { db, dek, secretKey } = this.requireUnlocked();
    const id = randomUuid();
    const now = Date.now();
    db.upsertItem({
      id,
      type: 'password',
      meta_ct: sealJson(dek, meta, itemAad(id, 'password', 'meta')),
      secret_ct: sealJson(secretKey, secret, itemAad(id, 'password', 'secret')),
      created_at: now,
      updated_at: now,
    });
    await db.flush();
    return { id, type: 'password', meta, createdAt: now, updatedAt: now };
  }

  async updatePasswordItem(id: string, meta: PasswordMeta, secret?: PasswordSecret): Promise<VaultItemSummary> {
    const { db, dek, secretKey } = this.requireUnlocked();
    const existing = db.getItem(id);
    if (!existing || existing.type !== 'password') {
      throw new Error('Password item not found.');
    }
    const now = Date.now();
    db.upsertItem({
      id,
      type: 'password',
      meta_ct: sealJson(dek, meta, itemAad(id, 'password', 'meta')),
      secret_ct: secret ? sealJson(secretKey, secret, itemAad(id, 'password', 'secret')) : existing.secret_ct,
      created_at: existing.created_at,
      updated_at: now,
    });
    await db.flush();
    return { id, type: 'password', meta, createdAt: existing.created_at, updatedAt: now };
  }

  async createTotpItem(meta: TotpMeta, secret: TotpSecret): Promise<VaultItemSummary> {
    const { db, dek, secretKey } = this.requireUnlocked();
    const id = randomUuid();
    const now = Date.now();
    const normalizedMeta: TotpMeta = { ...meta, hasStaticCode: Boolean(secret.staticCode) };
    db.upsertItem({
      id,
      type: 'totp',
      meta_ct: sealJson(dek, normalizedMeta, itemAad(id, 'totp', 'meta')),
      secret_ct: sealJson(secretKey, secret, itemAad(id, 'totp', 'secret')),
      created_at: now,
      updated_at: now,
    });
    await db.flush();
    return { id, type: 'totp', meta: normalizedMeta, createdAt: now, updatedAt: now };
  }

  async updateTotpItem(id: string, meta: TotpMeta, secret?: TotpSecret): Promise<VaultItemSummary> {
    const { db, dek, secretKey } = this.requireUnlocked();
    const existing = db.getItem(id);
    if (!existing || existing.type !== 'totp') {
      throw new Error('TOTP item not found.');
    }
    const now = Date.now();
    const normalizedMeta: TotpMeta = secret
      ? { ...meta, hasStaticCode: Boolean(secret.staticCode) }
      : meta;
    db.upsertItem({
      id,
      type: 'totp',
      meta_ct: sealJson(dek, normalizedMeta, itemAad(id, 'totp', 'meta')),
      secret_ct: secret ? sealJson(secretKey, secret, itemAad(id, 'totp', 'secret')) : existing.secret_ct,
      created_at: existing.created_at,
      updated_at: now,
    });
    await db.flush();
    return { id, type: 'totp', meta: normalizedMeta, createdAt: existing.created_at, updatedAt: now };
  }

  async deleteItem(id: string): Promise<void> {
    const { db } = this.requireUnlocked();
    db.deleteItem(id);
    await db.flush();
  }

  readPasswordSecret(id: string): PasswordSecret {
    const { db, secretKey } = this.requireUnlocked();
    const row = db.getItem(id);
    if (!row || row.type !== 'password') {
      throw new Error('Password item not found.');
    }
    return openJson<PasswordSecret>(secretKey, row.secret_ct, itemAad(id, 'password', 'secret'));
  }

  readTotpSecret(id: string): TotpSecret {
    const { db, secretKey } = this.requireUnlocked();
    const row = db.getItem(id);
    if (!row || row.type !== 'totp') {
      throw new Error('TOTP item not found.');
    }
    return openJson<TotpSecret>(secretKey, row.secret_ct, itemAad(id, 'totp', 'secret'));
  }

  listCategories(): CategoryItem[] {
    const { db, dek } = this.requireUnlocked();
    return db.listCategories().map((row) => ({
      id: row.id,
      name: openJson<string>(dek, row.name_ct, categoryAad(row.id)),
    }));
  }

  async createCategory(name: string): Promise<CategoryItem> {
    const { db, dek } = this.requireUnlocked();
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Category name cannot be empty.');
    const id = randomUuid();
    db.upsertCategory(id, sealJson(dek, trimmed, categoryAad(id)));
    await db.flush();
    return { id, name: trimmed };
  }

  async deleteCategory(id: string): Promise<void> {
    const { db } = this.requireUnlocked();
    db.deleteCategory(id);
    await db.flush();
  }

  exportPlainPayload(): BackupPlainPayload {
    const items = this.listItems();
    const passwords: BackupPlainPayload['passwords'] = [];
    const totps: BackupPlainPayload['totps'] = [];

    for (const item of items) {
      if (item.type === 'password') {
        passwords.push({
          id: item.id,
          meta: item.meta,
          secret: this.readPasswordSecret(item.id),
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        });
      } else {
        totps.push({
          id: item.id,
          meta: item.meta,
          secret: this.readTotpSecret(item.id),
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        });
      }
    }

    return {
      exportedAt: Date.now(),
      settings: this.getSettings(),
      categories: this.listCategories(),
      passkey: this.getPasskeyRecord(),
      passwords,
      totps,
    };
  }

  async restoreFromPlainPayload(
    payload: BackupPlainPayload,
    newMasterPassword: string,
    options?: { deviceBound?: boolean }
  ): Promise<void> {
    await this.setup(newMasterPassword, options);
    const { db, dek, secretKey } = this.requireUnlocked();

    db.setMeta('settings_ct', sealJson(dek, { ...DEFAULT_VAULT_SETTINGS, ...payload.settings }, metaRecordAad('settings_ct')));
    if (payload.passkey !== undefined) {
      db.setMeta(
        'passkey_ct',
        sealJson<PasskeyRecord | null>(dek, payload.passkey, metaRecordAad('passkey_ct'))
      );
    }

    for (const cat of payload.categories) {
      db.upsertCategory(cat.id, sealJson(dek, cat.name, categoryAad(cat.id)));
    }
    for (const pw of payload.passwords) {
      db.upsertItem({
        id: pw.id,
        type: 'password',
        meta_ct: sealJson(dek, pw.meta, itemAad(pw.id, 'password', 'meta')),
        secret_ct: sealJson(secretKey, pw.secret, itemAad(pw.id, 'password', 'secret')),
        created_at: pw.createdAt,
        updated_at: pw.updatedAt,
      });
    }
    for (const totp of payload.totps) {
      db.upsertItem({
        id: totp.id,
        type: 'totp',
        meta_ct: sealJson(dek, { ...totp.meta, hasStaticCode: Boolean(totp.secret.staticCode) }, itemAad(totp.id, 'totp', 'meta')),
        secret_ct: sealJson(secretKey, totp.secret, itemAad(totp.id, 'totp', 'secret')),
        created_at: totp.createdAt,
        updated_at: totp.updatedAt,
      });
    }
    await db.flush();
  }

  private setSessionKeys(dek: Uint8Array): void {
    zeroize(this.dek, this.secretKey, this.passkeyKey);
    this.dek = dek;
    this.secretKey = deriveSecretFieldKey(dek);
    this.passkeyKey = derivePasskeyKey(dek);
  }

  private requireUnlocked(): { db: VaultDatabase; dek: Uint8Array; secretKey: Uint8Array } {
    if (!this.db || !this.dek || !this.secretKey) {
      throw new VaultLockedError();
    }
    return { db: this.db, dek: this.dek, secretKey: this.secretKey };
  }
}
