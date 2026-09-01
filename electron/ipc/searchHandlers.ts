import { ipcMain } from 'electron';
import type Database from 'better-sqlite3-multiple-ciphers';
import { searchNotes } from '../db/notes';
import type { LockSession } from '../db/lockSession';
import { IPC_CHANNELS } from './channels';
import { toIpcResult } from './types';
import type { IpcResult } from './types';
import { toPublicNote } from './notesHandlers';
import type { PublicNoteRow } from './notesHandlers';
import { requireString } from './validation';

// FR-5.3: a locked note is still matched by title or content and still shows
// its title in results, but its content/content_plain must never cross the
// IPC boundary here until it's been unlocked this session — toPublicNote
// applies the exact same lock-aware redaction every other note-returning
// handler does (notesHandlers.ts), so once a note has been unlocked its real
// content_plain shows up in search previews again too (architecture.md:
// "excluded from search-result previews until unlocked").
export function handleSearchQuery(
  db: Database.Database,
  lockSession: LockSession,
  input: unknown,
): IpcResult<PublicNoteRow[]> {
  return toIpcResult(() =>
    searchNotes(db, requireString(input, 'query')).map((note) =>
      toPublicNote(note, lockSession.isUnlocked(note.id)),
    ),
  );
}

export function registerSearchHandlers(db: Database.Database, lockSession: LockSession): void {
  ipcMain.handle(IPC_CHANNELS.search.query, (_event, input) =>
    handleSearchQuery(db, lockSession, input),
  );
}
