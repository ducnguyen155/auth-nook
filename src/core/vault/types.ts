export type ItemType = 'password' | 'totp';

export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';
export type StaticCodePosition = 'prefix' | 'suffix';

export interface PasswordMeta {
  title: string;
  website: string;
  username: string;
  categoryId: string | null;
  tags: string[];
}

export interface PasswordSecret {
  password: string;
  notes: string;
}

export interface TotpMeta {
  issuer: string;
  account: string;
  digits: 6 | 8;
  period: number;
  algorithm: TotpAlgorithm;
  categoryId?: string | null;
  hasStaticCode: boolean;
  staticCodePosition: StaticCodePosition;
  staticCodeSeparator: string;
}

export interface TotpSecret {
  secret: string;
  staticCode?: string;
}

export type VaultItemSummary =
  | {
      id: string;
      type: 'password';
      meta: PasswordMeta;
      createdAt: number;
      updatedAt: number;
    }
  | {
      id: string;
      type: 'totp';
      meta: TotpMeta;
      createdAt: number;
      updatedAt: number;
    };

export interface CategoryItem {
  id: string;
  name: string;
}

export interface VaultSettings {
  autoLockMinutes: number; // 0 = disabled, otherwise 1 | 5 | 15 | 30
  lockOnMinimize: boolean;
  clipboardClearSeconds: number; // default 30
  otpHideSeconds: number; // default 8
  lastBackupAt: number | null;
  backupReminderDismissed: boolean;
}

export const DEFAULT_VAULT_SETTINGS: VaultSettings = {
  autoLockMinutes: 5,
  lockOnMinimize: false,
  clipboardClearSeconds: 30,
  otpHideSeconds: 8,
  lastBackupAt: null,
  backupReminderDismissed: false,
};

export interface PasskeyRecord {
  length: number;
  hashes: string[]; // base64 HMAC-SHA256 per 0-based position
}

export interface RevealStateRecord {
  failedAttempts: number;
  lastIndex: number | null;
}

export interface BackupPlainPayload {
  exportedAt: number;
  settings: VaultSettings;
  categories: CategoryItem[];
  passkey?: PasskeyRecord | null;
  passwords: Array<{
    id: string;
    meta: PasswordMeta;
    secret: PasswordSecret;
    createdAt: number;
    updatedAt: number;
  }>;
  totps: Array<{
    id: string;
    meta: TotpMeta;
    secret: TotpSecret;
    createdAt: number;
    updatedAt: number;
  }>;
}
