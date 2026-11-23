import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { Platform } from '../../platform/platform.ts';
import { CURRENT_SCHEMA_VERSION, SCHEMA_SQL } from './schema.ts';
import { utf8ToBytes, bytesToUtf8 } from '../crypto/encoding.ts';

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    sqlJsPromise = initSqlJs(
      isBrowser ? { locateFile: () => wasmUrl, useOldExtensionFunctions: false } : undefined
    );
  }
  return sqlJsPromise;
}

export interface StoredItemRow {
  id: string;
  type: 'password' | 'totp';
  meta_ct: Uint8Array;
  secret_ct: Uint8Array;
  created_at: number;
  updated_at: number;
}

export interface StoredCategoryRow {
  id: string;
  name_ct: Uint8Array;
}

/**
 * SQLite database wrapper backed by sql.js (WASM) with atomic file persistence.
 */
export class VaultDatabase {
  private readonly db: Database;
  private readonly platform: Platform;
  private readonly filePath: string;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistPending: Promise<void> | null = null;

  private constructor(db: Database, platform: Platform, filePath: string) {
    this.db = db;
    this.platform = platform;
    this.filePath = filePath;
  }

  static async openOrCreate(platform: Platform, filePath: string): Promise<VaultDatabase> {
    const SQL = await getSqlJs();
    const exists = await platform.exists(filePath);
    const db = exists ? new SQL.Database(await platform.readFile(filePath)) : new SQL.Database();
    db.run(SCHEMA_SQL);
    const instance = new VaultDatabase(db, platform, filePath);
    if (!exists) {
      instance.setMeta('schema_version', utf8ToBytes(String(CURRENT_SCHEMA_VERSION)));
      await instance.flush();
    }
    return instance;
  }

  static async createFresh(platform: Platform, filePath: string): Promise<VaultDatabase> {
    const SQL = await getSqlJs();
    const db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const instance = new VaultDatabase(db, platform, filePath);
    instance.setMeta('schema_version', utf8ToBytes(String(CURRENT_SCHEMA_VERSION)));
    return instance;
  }

  getMeta(key: string): Uint8Array | null {
    const stmt = this.db.prepare('SELECT value FROM meta WHERE key = ?');
    try {
      stmt.bind([key]);
      if (!stmt.step()) return null;
      const row = stmt.getAsObject() as { value: Uint8Array };
      return new Uint8Array(row.value);
    } finally {
      stmt.free();
    }
  }

  getMetaString(key: string): string | null {
    const bytes = this.getMeta(key);
    return bytes ? bytesToUtf8(bytes) : null;
  }

  setMeta(key: string, value: Uint8Array): void {
    this.db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
  }

  setMetaString(key: string, value: string): void {
    this.setMeta(key, utf8ToBytes(value));
  }

  deleteMeta(key: string): void {
    this.db.run('DELETE FROM meta WHERE key = ?', [key]);
  }

  listItems(): StoredItemRow[] {
    const stmt = this.db.prepare(
      'SELECT id, type, meta_ct, secret_ct, created_at, updated_at FROM items ORDER BY updated_at DESC'
    );
    const rows: StoredItemRow[] = [];
    try {
      while (stmt.step()) {
        const row = stmt.getAsObject() as {
          id: string;
          type: 'password' | 'totp';
          meta_ct: Uint8Array;
          secret_ct: Uint8Array;
          created_at: number;
          updated_at: number;
        };
        rows.push({
          id: row.id,
          type: row.type,
          meta_ct: new Uint8Array(row.meta_ct),
          secret_ct: new Uint8Array(row.secret_ct),
          created_at: Number(row.created_at),
          updated_at: Number(row.updated_at),
        });
      }
    } finally {
      stmt.free();
    }
    return rows;
  }

  getItem(id: string): StoredItemRow | null {
    const stmt = this.db.prepare(
      'SELECT id, type, meta_ct, secret_ct, created_at, updated_at FROM items WHERE id = ?'
    );
    try {
      stmt.bind([id]);
      if (!stmt.step()) return null;
      const row = stmt.getAsObject() as {
        id: string;
        type: 'password' | 'totp';
        meta_ct: Uint8Array;
        secret_ct: Uint8Array;
        created_at: number;
        updated_at: number;
      };
      return {
        id: row.id,
        type: row.type,
        meta_ct: new Uint8Array(row.meta_ct),
        secret_ct: new Uint8Array(row.secret_ct),
        created_at: Number(row.created_at),
        updated_at: Number(row.updated_at),
      };
    } finally {
      stmt.free();
    }
  }

  upsertItem(row: StoredItemRow): void {
    this.db.run(
      `INSERT OR REPLACE INTO items (id, type, meta_ct, secret_ct, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [row.id, row.type, row.meta_ct, row.secret_ct, row.created_at, row.updated_at]
    );
  }

  deleteItem(id: string): void {
    this.db.run('DELETE FROM items WHERE id = ?', [id]);
  }

  listCategories(): StoredCategoryRow[] {
    const stmt = this.db.prepare('SELECT id, name_ct FROM categories');
    const rows: StoredCategoryRow[] = [];
    try {
      while (stmt.step()) {
        const row = stmt.getAsObject() as { id: string; name_ct: Uint8Array };
        rows.push({ id: row.id, name_ct: new Uint8Array(row.name_ct) });
      }
    } finally {
      stmt.free();
    }
    return rows;
  }

  upsertCategory(id: string, nameCt: Uint8Array): void {
    this.db.run('INSERT OR REPLACE INTO categories (id, name_ct) VALUES (?, ?)', [id, nameCt]);
  }

  deleteCategory(id: string): void {
    this.db.run('DELETE FROM categories WHERE id = ?', [id]);
  }

  schedulePersist(delayMs = 100): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.flush();
    }, delayMs);
  }

  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    const data = this.db.export();
    const writePromise = this.platform.writeFileAtomic(this.filePath, data);
    this.persistPending = writePromise;
    try {
      await writePromise;
    } finally {
      if (this.persistPending === writePromise) {
        this.persistPending = null;
      }
    }
  }

  async close(): Promise<void> {
    if (this.persistTimer) {
      await this.flush();
    } else if (this.persistPending) {
      await this.persistPending;
    }
    this.db.close();
  }
}
