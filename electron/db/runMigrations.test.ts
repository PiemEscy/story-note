import { describe, expect, it } from 'vitest';
import { runMigrations } from './runMigrations';
import { createTestDatabase } from './testHelpers';

describe('runMigrations', () => {
  it('creates notes, labels, and settings tables on a fresh database', () => {
    const { db, close } = createTestDatabase();
    try {
      const tables = (
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
          name: string;
        }[]
      ).map((row) => row.name);

      expect(tables).toEqual(expect.arrayContaining(['notes', 'labels', 'settings']));
    } finally {
      close();
    }
  });

  it('sets user_version to the latest applied migration version', () => {
    const { db, close } = createTestDatabase();
    try {
      expect(db.pragma('user_version', { simple: true })).toBe(1);
    } finally {
      close();
    }
  });

  it('enables foreign key enforcement (required for ON DELETE SET NULL)', () => {
    const { db, close } = createTestDatabase();
    try {
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    } finally {
      close();
    }
  });

  it('is idempotent — re-running on an already-migrated database is a no-op', () => {
    const { db, close } = createTestDatabase();
    try {
      expect(() => runMigrations(db)).not.toThrow();
      expect(db.pragma('user_version', { simple: true })).toBe(1);
    } finally {
      close();
    }
  });
});
