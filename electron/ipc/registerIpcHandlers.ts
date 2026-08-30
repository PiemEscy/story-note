import type Database from 'better-sqlite3-multiple-ciphers';
import { registerLabelsHandlers } from './labelsHandlers';
import { registerNotesHandlers } from './notesHandlers';
import { registerSettingsHandlers } from './settingsHandlers';

export function registerIpcHandlers(db: Database.Database): void {
  registerNotesHandlers(db);
  registerLabelsHandlers(db);
  registerSettingsHandlers(db);
}
