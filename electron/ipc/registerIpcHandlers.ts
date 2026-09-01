import type Database from 'better-sqlite3-multiple-ciphers';
import { createLockSession } from '../db/lockSession';
import type { LockSession } from '../db/lockSession';
import { registerLabelsHandlers } from './labelsHandlers';
import { registerNotesHandlers } from './notesHandlers';
import { registerSearchHandlers } from './searchHandlers';
import { registerSettingsHandlers } from './settingsHandlers';

// Returns the LockSession it created so callers outside the IPC layer that
// also need to act on it — electron/shortcuts.ts's quick-lock shortcut — can
// share the exact same instance, rather than each holding its own
// (independent, out-of-sync) unlocked-notes record.
export function registerIpcHandlers(db: Database.Database): LockSession {
  // One LockSession per app run, shared by every handler that reads or acts
  // on note content — see electron/db/lockSession.ts for why this lives here
  // rather than being recreated per-handler-file.
  const lockSession = createLockSession();
  registerNotesHandlers(db, lockSession);
  registerLabelsHandlers(db, lockSession);
  registerSettingsHandlers(db);
  registerSearchHandlers(db, lockSession);
  return lockSession;
}
