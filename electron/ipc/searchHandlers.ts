import { ipcMain } from 'electron';
import type Database from 'better-sqlite3-multiple-ciphers';
import { searchNotes } from '../db/notes';
import { IPC_CHANNELS } from './channels';
import { toIpcResult } from './types';
import type { IpcResult } from './types';
import { toPublicNote } from './notesHandlers';
import type { PublicNoteRow } from './notesHandlers';
import { requireString } from './validation';

// FR-5.3: a locked note is still matched by title or content and still shows
// its title in results, but its content_plain must never cross the IPC
// boundary here — redacted server-side rather than trusted to the renderer
// to hide, same defense-in-depth as password_hash's exclusion from
// PublicNoteRow (toPublicNote in notesHandlers.ts).
export function handleSearchQuery(
  db: Database.Database,
  input: unknown,
): IpcResult<PublicNoteRow[]> {
  return toIpcResult(() =>
    searchNotes(db, requireString(input, 'query')).map((note) => {
      const publicNote = toPublicNote(note);
      return note.is_locked ? { ...publicNote, content_plain: '' } : publicNote;
    }),
  );
}

export function registerSearchHandlers(db: Database.Database): void {
  ipcMain.handle(IPC_CHANNELS.search.query, (_event, input) => handleSearchQuery(db, input));
}
