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
// launch_on_startup (schema.md) — called once at app startup, to apply
// whatever was last persisted. The Settings panel's own "Launch at startup"
// toggle (electron/ipc/windowHandlers.ts's handleSetLaunchOnStartup) applies
// live changes directly via app.setLoginItemSettings — this function only
// covers the startup case, not a live-apply path of its own.
export function syncLoginItemSetting(
  db: Database.Database,
  deps: LoginItemDeps = defaultDeps,
): void {
  deps.setLoginItemSettings({ openAtLogin: getBooleanSetting(db, 'launch_on_startup') });
}
