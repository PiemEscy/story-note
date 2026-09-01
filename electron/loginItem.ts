import { app } from 'electron';
import type Database from 'better-sqlite3-multiple-ciphers';
import { getBooleanSetting } from './db/settings';

export interface LoginItemDeps {
  setLoginItemSettings: (settings: { openAtLogin: boolean }) => void;
}

const defaultDeps: LoginItemDeps = {
  setLoginItemSettings: (settings) => app.setLoginItemSettings(settings),
};

// Syncs the OS-level "launch at login" registration to settings.
// launch_on_startup (schema.md) — called once at app startup. There's no
// toggle UI for this setting yet (Phase 11 owns the Settings panel), so
// this only ever reflects whatever was last persisted; a login-item change
// only matters "next time you log in" anyway, so there's no need for a
// live-apply path before that UI exists.
export function syncLoginItemSetting(
  db: Database.Database,
  deps: LoginItemDeps = defaultDeps,
): void {
  deps.setLoginItemSettings({ openAtLogin: getBooleanSetting(db, 'launch_on_startup') });
}
