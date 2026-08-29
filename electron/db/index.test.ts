import { randomBytes } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from './index';

function randomKey(): string {
  return randomBytes(32).toString('hex');
}

describe('openDatabase', () => {
  it('rejects a malformed key before touching the filesystem', () => {
    expect(() => openDatabase({ userDataPath: tmpdir(), key: 'not-a-valid-key' })).toThrow();
  });

  it('creates a working database that persists data across reopens with the correct key', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'storynote-test-'));
    const key = randomKey();
    try {
      const db1 = openDatabase({ userDataPath, key });
      db1.prepare('INSERT INTO labels (name) VALUES (?)').run('Work');
      db1.close();

      const db2 = openDatabase({ userDataPath, key });
      const row = db2.prepare('SELECT name FROM labels WHERE name = ?').get('Work');
      db2.close();

      expect(row).toEqual({ name: 'Work' });
    } finally {
      rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  it('refuses to open an existing database with the wrong key (FR-4.3-equivalent for the db-level key)', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'storynote-test-'));
    try {
      const db1 = openDatabase({ userDataPath, key: randomKey() });
      db1.close();

      expect(() => openDatabase({ userDataPath, key: randomKey() })).toThrow();
    } finally {
      rmSync(userDataPath, { recursive: true, force: true });
    }
  });
});
