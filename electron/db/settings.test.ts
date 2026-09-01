import { describe, expect, it } from 'vitest';
import {
  deleteSetting,
  getAllSettings,
  getBooleanSetting,
  getSetting,
  setSetting,
} from './settings';
import { createTestDatabase } from './testHelpers';

describe('settings', () => {
  it('returns undefined for a key that was never set', () => {
    const { db, close } = createTestDatabase();
    try {
      expect(getSetting(db, 'theme')).toBeUndefined();
    } finally {
      close();
    }
  });

  it('sets and reads back a value', () => {
    const { db, close } = createTestDatabase();
    try {
      setSetting(db, 'theme', 'dark');
      expect(getSetting(db, 'theme')).toBe('dark');
    } finally {
      close();
    }
  });

  it('setSetting upserts — a second call overwrites rather than erroring', () => {
    const { db, close } = createTestDatabase();
    try {
      setSetting(db, 'theme', 'dark');
      setSetting(db, 'theme', 'light');
      expect(getSetting(db, 'theme')).toBe('light');
    } finally {
      close();
    }
  });

  it('getAllSettings returns every stored key-value pair', () => {
    const { db, close } = createTestDatabase();
    try {
      setSetting(db, 'theme', 'dark');
      setSetting(db, 'sort_by', 'updated_at');

      expect(getAllSettings(db)).toEqual({ theme: 'dark', sort_by: 'updated_at' });
    } finally {
      close();
    }
  });

  it('deleteSetting removes the key', () => {
    const { db, close } = createTestDatabase();
    try {
      setSetting(db, 'theme', 'dark');
      deleteSetting(db, 'theme');

      expect(getSetting(db, 'theme')).toBeUndefined();
    } finally {
      close();
    }
  });
});

describe('getBooleanSetting', () => {
  it('is true only for the exact string "true"', () => {
    const { db, close } = createTestDatabase();
    try {
      setSetting(db, 'always_on_top', 'true');
      expect(getBooleanSetting(db, 'always_on_top')).toBe(true);
    } finally {
      close();
    }
  });

  it('is false for "false", anything else, or an unset key', () => {
    const { db, close } = createTestDatabase();
    try {
      setSetting(db, 'compact_mode', 'false');
      setSetting(db, 'start_minimized', 'yes');

      expect(getBooleanSetting(db, 'compact_mode')).toBe(false);
      expect(getBooleanSetting(db, 'start_minimized')).toBe(false);
      expect(getBooleanSetting(db, 'launch_on_startup')).toBe(false);
    } finally {
      close();
    }
  });
});
