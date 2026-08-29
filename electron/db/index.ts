import Database from 'better-sqlite3-multiple-ciphers';
import { getDatabasePath } from './getDatabasePath';
import { assertHexKey } from './keys';
import { runMigrations } from './runMigrations';

export interface OpenDatabaseOptions {
  userDataPath: string;
  key: string;
}

// Opens (creating if needed) the encrypted SQLite database and brings its
// schema up to date. `key` must already be resolved by the caller — see
// `resolveEncryptionKey` in `./keys` — since choosing *how* to get the key
// (OS credential store vs. a prompted master password) is an orchestration
// concern, not a connection concern.
export function openDatabase({ userDataPath, key }: OpenDatabaseOptions): Database.Database {
  assertHexKey(key);

  const db = new Database(getDatabasePath(userDataPath));

  try {
    // Cipher/legacy pragmas select full SQLCipher-compatible encryption
    // (rather than this driver's own default "sqleet" cipher) and must run
    // before PRAGMA key, on every open — per schema.md and ADR-001.
    db.pragma("cipher='sqlcipher'");
    db.pragma('legacy=4');
    db.pragma(`key='${key}'`);
    db.pragma('journal_mode = WAL');
    // Off by default in SQLite; required for the `ON DELETE SET NULL` on
    // notes.label_id (schema.md) to actually take effect.
    db.pragma('foreign_keys = ON');

    runMigrations(db);

    return db;
  } catch (error) {
    // Wrong key, corrupt file, or a failed migration all leave `db` holding
    // an open file handle — close it before propagating, or the caller has
    // no way to release it (they never received the reference).
    db.close();
    throw error;
  }
}
