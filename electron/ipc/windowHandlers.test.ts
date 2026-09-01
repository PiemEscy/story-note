import { describe, expect, it, vi } from 'vitest';
import { createTestDatabase } from '../db/testHelpers';
import { getSetting } from '../db/settings';
import { handleSetAlwaysOnTop, handleSetLaunchOnStartup } from './windowHandlers';

describe('handleSetAlwaysOnTop', () => {
  it('applies the value to the live window and persists it', () => {
    const { db, close } = createTestDatabase();
    try {
      const setAlwaysOnTop = vi.fn();
      const deps = { setAlwaysOnTop, setLoginItemSettings: vi.fn() };

      const result = handleSetAlwaysOnTop(db, true, deps);

      expect(result).toEqual({ ok: true, data: undefined });
      expect(setAlwaysOnTop).toHaveBeenCalledWith(true);
      expect(getSetting(db, 'always_on_top')).toBe('true');
    } finally {
      close();
    }
  });

  it('rejects a non-boolean value without applying or persisting anything', () => {
    const { db, close } = createTestDatabase();
    try {
      const setAlwaysOnTop = vi.fn();
      const deps = { setAlwaysOnTop, setLoginItemSettings: vi.fn() };

      const result = handleSetAlwaysOnTop(db, 'true', deps);

      expect(result.ok).toBe(false);
      expect(setAlwaysOnTop).not.toHaveBeenCalled();
      expect(getSetting(db, 'always_on_top')).toBeUndefined();
    } finally {
      close();
    }
  });
});

describe('handleSetLaunchOnStartup', () => {
  it('applies the value to the OS login item and persists it', () => {
    const { db, close } = createTestDatabase();
    try {
      const setLoginItemSettings = vi.fn();
      const deps = { setAlwaysOnTop: vi.fn(), setLoginItemSettings };

      const result = handleSetLaunchOnStartup(db, false, deps);

      expect(result).toEqual({ ok: true, data: undefined });
      expect(setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: false });
      expect(getSetting(db, 'launch_on_startup')).toBe('false');
    } finally {
      close();
    }
  });

  it('rejects a non-boolean value without applying or persisting anything', () => {
    const { db, close } = createTestDatabase();
    try {
      const setLoginItemSettings = vi.fn();
      const deps = { setAlwaysOnTop: vi.fn(), setLoginItemSettings };

      const result = handleSetLaunchOnStartup(db, null, deps);

      expect(result.ok).toBe(false);
      expect(setLoginItemSettings).not.toHaveBeenCalled();
      expect(getSetting(db, 'launch_on_startup')).toBeUndefined();
    } finally {
      close();
    }
  });
});
