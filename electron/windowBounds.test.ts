import { describe, expect, it } from 'vitest';
import { DEFAULT_WINDOW_BOUNDS, getSavedWindowBounds, saveWindowBounds } from './windowBounds';
import { createTestDatabase } from './db/testHelpers';

describe('getSavedWindowBounds', () => {
  it('returns the default when nothing is persisted yet', () => {
    const { db, close } = createTestDatabase();
    try {
      expect(getSavedWindowBounds(db)).toEqual(DEFAULT_WINDOW_BOUNDS);
    } finally {
      close();
    }
  });

  it('round-trips a saved value', () => {
    const { db, close } = createTestDatabase();
    try {
      saveWindowBounds(db, { width: 1400, height: 900, x: 50, y: 60 });

      expect(getSavedWindowBounds(db)).toEqual({ width: 1400, height: 900, x: 50, y: 60 });
    } finally {
      close();
    }
  });

  it('falls back to the default for corrupt JSON', () => {
    const { db, close } = createTestDatabase();
    try {
      db.prepare(
        "INSERT INTO settings (key, value) VALUES ('window_bounds', 'not json at all')",
      ).run();

      expect(getSavedWindowBounds(db)).toEqual(DEFAULT_WINDOW_BOUNDS);
    } finally {
      close();
    }
  });

  it('falls back to the default for a width/height below the window minimums', () => {
    const { db, close } = createTestDatabase();
    try {
      saveWindowBounds(db, { width: 100, height: 100 });

      expect(getSavedWindowBounds(db)).toEqual(DEFAULT_WINDOW_BOUNDS);
    } finally {
      close();
    }
  });

  it('falls back to the default when width/height are missing or the wrong type', () => {
    const { db, close } = createTestDatabase();
    try {
      db.prepare("INSERT INTO settings (key, value) VALUES ('window_bounds', ?)").run(
        JSON.stringify({ width: '1400', height: 900 }),
      );

      expect(getSavedWindowBounds(db)).toEqual(DEFAULT_WINDOW_BOUNDS);
    } finally {
      close();
    }
  });
});
