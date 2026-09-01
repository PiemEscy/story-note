import { describe, expect, it, vi } from 'vitest';
import { syncLoginItemSetting } from './loginItem';
import { createTestDatabase } from './db/testHelpers';
import { setSetting } from './db/settings';

describe('syncLoginItemSetting', () => {
  it('sets openAtLogin: true when launch_on_startup is persisted as true', () => {
    const { db, close } = createTestDatabase();
    try {
      setSetting(db, 'launch_on_startup', 'true');
      const setLoginItemSettings = vi.fn();

      syncLoginItemSetting(db, { setLoginItemSettings });

      expect(setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true });
    } finally {
      close();
    }
  });

  it('sets openAtLogin: false when nothing is persisted', () => {
    const { db, close } = createTestDatabase();
    try {
      const setLoginItemSettings = vi.fn();

      syncLoginItemSetting(db, { setLoginItemSettings });

      expect(setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: false });
    } finally {
      close();
    }
  });
});
