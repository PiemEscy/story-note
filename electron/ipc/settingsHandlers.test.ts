import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../db/testHelpers';
import { handleDelete, handleGet, handleGetAll, handleSet } from './settingsHandlers';

describe('settings IPC handlers — happy path', () => {
  it('sets, gets, lists, and deletes a setting', () => {
    const { db, close } = createTestDatabase();
    try {
      expect(handleSet(db, { key: 'theme', value: 'dark' })).toEqual({ ok: true, data: undefined });
      expect(handleGet(db, 'theme')).toEqual({ ok: true, data: 'dark' });

      const all = handleGetAll(db);
      expect(all).toEqual({ ok: true, data: { theme: 'dark' } });

      expect(handleDelete(db, 'theme')).toEqual({ ok: true, data: undefined });
      expect(handleGet(db, 'theme')).toEqual({ ok: true, data: undefined });
    } finally {
      close();
    }
  });
});

describe('settings IPC handlers — malformed input fails gracefully', () => {
  it('handleGet rejects a non-string key', () => {
    const { db, close } = createTestDatabase();
    try {
      const result = handleGet(db, 42);
      expect(result.ok).toBe(false);
    } finally {
      close();
    }
  });

  it('handleSet rejects a non-string value', () => {
    const { db, close } = createTestDatabase();
    try {
      const result = handleSet(db, { key: 'theme', value: { nested: true } });
      expect(result.ok).toBe(false);
    } finally {
      close();
    }
  });

  it('handleSet rejects entirely malformed (non-object) input', () => {
    const { db, close } = createTestDatabase();
    try {
      expect(handleSet(db, 'theme=dark').ok).toBe(false);
      expect(handleSet(db, null).ok).toBe(false);
    } finally {
      close();
    }
  });

  it('handleDelete rejects a non-string key', () => {
    const { db, close } = createTestDatabase();
    try {
      expect(handleDelete(db, { key: 'theme' }).ok).toBe(false);
    } finally {
      close();
    }
  });
});
