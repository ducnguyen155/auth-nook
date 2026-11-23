import { openJson, sealJson, zeroize } from '../crypto/aead.ts';
import { base64ToBytes, bytesToBase64, utf8ToBytes } from '../crypto/encoding.ts';
import { DEFAULT_KDF_PARAMS, derivePasswordKey, validateKdfParams, type KdfParams } from '../crypto/kdf.ts';
import { randomBytes } from '../crypto/random.ts';
import type { BackupPlainPayload } from '../vault/types.ts';
import type { VaultService } from '../vault/vaultService.ts';

const BACKUP_FORMAT = 'authnook-backup';
const BACKUP_VERSION = 1;
const BACKUP_AAD = utf8ToBytes('authnook/backup/v1');

export interface EncryptedBackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  kdf: KdfParams;
  salt: string; // base64
  sealed: string; // base64 XChaCha20-Poly1305 ciphertext
}

/**
 * Exports the unlocked vault to an encrypted, device-independent `.authnook` backup JSON.
 */
export async function exportEncryptedBackup(
  vault: VaultService,
  backupPassword: string,
  kdfParams: KdfParams = DEFAULT_KDF_PARAMS
): Promise<Uint8Array> {
  if (backupPassword.length < 8) {
    throw new Error('Backup password must be at least 8 characters.');
  }

  const payload = vault.exportPlainPayload();
  const salt = randomBytes(16);
  let key: Uint8Array | null = null;

  try {
    key = await derivePasswordKey(backupPassword, salt, kdfParams);
    const sealed = sealJson(key, payload, BACKUP_AAD);
    const fileObj: EncryptedBackupFile = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      kdf: kdfParams,
      salt: bytesToBase64(salt),
      sealed: bytesToBase64(sealed),
    };
    return utf8ToBytes(JSON.stringify(fileObj, null, 2));
  } finally {
    zeroize(key);
  }
}

/**
 * Parses and decrypts an `.authnook` backup file using the backup password.
 */
export async function decryptEncryptedBackup(
  fileBytes: Uint8Array,
  backupPassword: string
): Promise<BackupPlainPayload> {
  let parsed: EncryptedBackupFile;
  try {
    parsed = JSON.parse(new TextDecoder().decode(fileBytes)) as EncryptedBackupFile;
  } catch {
    throw new Error('Invalid backup file format.');
  }

  if (
    parsed.format !== BACKUP_FORMAT ||
    parsed.version !== BACKUP_VERSION ||
    !parsed.kdf ||
    typeof parsed.salt !== 'string' ||
    typeof parsed.sealed !== 'string'
  ) {
    throw new Error('Unsupported or corrupted backup file.');
  }

  const kdfParams = validateKdfParams(parsed.kdf);
  const salt = base64ToBytes(parsed.salt);
  const sealed = base64ToBytes(parsed.sealed);
  let key: Uint8Array | null = null;

  try {
    key = await derivePasswordKey(backupPassword, salt, kdfParams);
    return openJson<BackupPlainPayload>(key, sealed, BACKUP_AAD);
  } finally {
    zeroize(key);
  }
}
