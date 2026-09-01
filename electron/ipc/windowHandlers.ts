import { app, BrowserWindow, ipcMain } from 'electron';
import type Database from 'better-sqlite3-multiple-ciphers';
import { setSetting } from '../db/settings';
import { IPC_CHANNELS } from './channels';
import { toIpcResult } from './types';
import type { IpcResult } from './types';
import { requireBoolean } from './validation';

export interface WindowSettingsDeps {
  setAlwaysOnTop: (value: boolean) => void;
  setLoginItemSettings: (settings: { openAtLogin: boolean }) => void;
}

const defaultDeps: WindowSettingsDeps = {
  setAlwaysOnTop: (value) => BrowserWindow.getAllWindows()[0]?.setAlwaysOnTop(value),
  setLoginItemSettings: (settings) => app.setLoginItemSettings(settings),
};

// Unlike settingsHandlers.ts's generic set(), these apply the change to the
// running app immediately (the live window, the OS login-item registration)
// in addition to persisting it — settings:set alone would only take effect
// on the next launch.
export function handleSetAlwaysOnTop(
  db: Database.Database,
  input: unknown,
  deps: WindowSettingsDeps = defaultDeps,
): IpcResult<void> {
  return toIpcResult(() => {
    const value = requireBoolean(input, 'value');
    // Persisted before the live effect: if setSetting() were to throw after
    // deps.setAlwaysOnTop() already succeeded, the running window and the
    // persisted value would silently disagree until the next explicit
    // toggle — persisting first means a failure here leaves both sides
    // consistent (neither applied) instead.
    setSetting(db, 'always_on_top', String(value));
    deps.setAlwaysOnTop(value);
  });
}

export function handleSetLaunchOnStartup(
  db: Database.Database,
  input: unknown,
  deps: WindowSettingsDeps = defaultDeps,
): IpcResult<void> {
  return toIpcResult(() => {
    const value = requireBoolean(input, 'value');
    setSetting(db, 'launch_on_startup', String(value));
    deps.setLoginItemSettings({ openAtLogin: value });
  });
}

export function registerWindowHandlers(
  db: Database.Database,
  deps: WindowSettingsDeps = defaultDeps,
): void {
  ipcMain.handle(IPC_CHANNELS.window.setAlwaysOnTop, (_event, input) =>
    handleSetAlwaysOnTop(db, input, deps),
  );
  ipcMain.handle(IPC_CHANNELS.window.setLaunchOnStartup, (_event, input) =>
    handleSetLaunchOnStartup(db, input, deps),
  );
}
