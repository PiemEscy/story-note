import { ipcMain } from 'electron';
import type Database from 'better-sqlite3-multiple-ciphers';
import { deleteSetting, getAllSettings, getSetting, setSetting } from '../db/settings';
import { IPC_CHANNELS } from './channels';
import { toIpcResult } from './types';
import type { IpcResult } from './types';
import { isRecord, requireString } from './validation';

export function handleGet(db: Database.Database, input: unknown): IpcResult<string | undefined> {
  return toIpcResult(() => getSetting(db, requireString(input, 'key')));
}

export function handleGetAll(db: Database.Database): IpcResult<Record<string, string>> {
  return toIpcResult(() => getAllSettings(db));
}

export function handleSet(db: Database.Database, input: unknown): IpcResult<void> {
  return toIpcResult(() => {
    if (!isRecord(input)) {
      throw new Error('input must be an object');
    }
    setSetting(db, requireString(input.key, 'key'), requireString(input.value, 'value'));
  });
}

export function handleDelete(db: Database.Database, input: unknown): IpcResult<void> {
  return toIpcResult(() => deleteSetting(db, requireString(input, 'key')));
}

export function registerSettingsHandlers(db: Database.Database): void {
  ipcMain.handle(IPC_CHANNELS.settings.get, (_event, input) => handleGet(db, input));
  ipcMain.handle(IPC_CHANNELS.settings.getAll, () => handleGetAll(db));
  ipcMain.handle(IPC_CHANNELS.settings.set, (_event, input) => handleSet(db, input));
  ipcMain.handle(IPC_CHANNELS.settings.delete, (_event, input) => handleDelete(db, input));
}
