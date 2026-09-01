import type Database from 'better-sqlite3-multiple-ciphers';
import { createLockSession } from '../db/lockSession';
import { registerLabelsHandlers } from './labelsHandlers';
import { registerNotesHandlers } from './notesHandlers';
import { registerSearchHandlers } from './searchHandlers';
import { registerSettingsHandlers } from './settingsHandlers';

export function registerIpcHandlers(db: Database.Database): void {
  // One LockSession per app run, shared by every handler that reads or acts
  // on note content — see electron/db/lockSession.ts for why this lives here
  // rather than being recreated per-handler-file.
  const lockSession = createLockSession();
  registerNotesHandlers(db, lockSession);
  registerLabelsHandlers(db, lockSession);
  registerSettingsHandlers(db);
  registerSearchHandlers(db, lockSession);
}
