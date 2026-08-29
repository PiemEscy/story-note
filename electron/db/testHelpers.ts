import { randomBytes } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type Database from 'better-sqlite3-multiple-ciphers';
import { openDatabase } from './index';
import type { CredentialIdentity } from './keys';

export interface TestDatabase {
  db: Database.Database;
  userDataPath: string;
  key: string;
  close: () => void;
}

// A fresh, real (file-based, SQLCipher-encrypted) database per test — via
// the actual openDatabase() connection path, never the real userData
// database file (testing.md).
export function createTestDatabase(): TestDatabase {
  const userDataPath = mkdtempSync(join(tmpdir(), 'storynote-test-'));
  const key = randomBytes(32).toString('hex');
  const db = openDatabase({ userDataPath, key });

  return {
    db,
    userDataPath,
    key,
    close: () => {
      db.close();
      rmSync(userDataPath, { recursive: true, force: true });
    },
  };
}

// A distinct, per-test OS-credential identity — never the real app's
// 'storynote'/'sqlcipher-key' entry, so tests can never read, overwrite, or
// delete a real installed copy's stored encryption key on this machine.
export function createTestCredentialIdentity(): CredentialIdentity {
  return {
    service: 'storynote-test',
    account: `sqlcipher-key-${randomBytes(8).toString('hex')}`,
  };
}

// A fresh userData-style directory with no database file in it — for tests
// that need a userDataPath to pass to getKeyFromOS()/resolveEncryptionKey()
// but aren't testing the database connection itself. No db file existing at
// this path means getKeyFromOS() treats a missing credential as first
// launch (generates one) rather than throwing CredentialMissingError.
export interface TestUserDataDir {
  userDataPath: string;
  cleanup: () => void;
}

export function createEmptyUserDataDir(): TestUserDataDir {
  const userDataPath = mkdtempSync(join(tmpdir(), 'storynote-test-'));
  return {
    userDataPath,
    cleanup: () => rmSync(userDataPath, { recursive: true, force: true }),
  };
}
