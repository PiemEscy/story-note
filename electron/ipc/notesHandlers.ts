import { BrowserWindow, dialog, ipcMain } from 'electron';
import { writeFile } from 'fs/promises';
import type Database from 'better-sqlite3-multiple-ciphers';
import {
  createNote,
  getNoteById,
  getNoteCounts,
  listArchivedNotes,
  listNotes,
  listTrashedNotes,
  purgeNote,
  restoreNote,
  setArchived,
  setPinned,
  softDeleteNote,
  updateNote,
} from '../db/notes';
import type { NoteCounts } from '../db/notes';
import type { NoteRow } from '../db/types';
import { IPC_CHANNELS } from './channels';
import { toIpcResult, toIpcResultAsync } from './types';
import type { IpcResult } from './types';
import {
  isRecord,
  optionalNullableNumber,
  optionalSortDirection,
  optionalSortField,
  optionalString,
  requireBoolean,
  requireNumber,
} from './validation';

// The wire shape for a note — everything in NoteRow except password_hash.
// A note's lock state is exposed via is_locked; the hash itself must never
// reach the renderer (security review, Phase 2). Listed as an explicit
// allow-list rather than `const { password_hash, ...rest } = note`, so a
// future column added to NoteRow doesn't leak by default — it has to be
// deliberately added here.
export interface PublicNoteRow {
  id: number;
  title: string;
  content: string;
  content_plain: string;
  label_id: number | null;
  is_pinned: number;
  is_archived: number;
  is_locked: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function toPublicNote(note: NoteRow): PublicNoteRow {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    content_plain: note.content_plain,
    label_id: note.label_id,
    is_pinned: note.is_pinned,
    is_archived: note.is_archived,
    is_locked: note.is_locked,
    created_at: note.created_at,
    updated_at: note.updated_at,
    deleted_at: note.deleted_at,
  };
}

export function handleCreate(db: Database.Database, input: unknown): IpcResult<PublicNoteRow> {
  return toIpcResult(() => {
    const body = isRecord(input) ? input : {};
    return toPublicNote(
      createNote(db, {
        title: optionalString(body.title, 'title'),
        content: optionalString(body.content, 'content'),
        contentPlain: optionalString(body.contentPlain, 'contentPlain'),
        labelId: optionalNullableNumber(body.labelId, 'labelId'),
      }),
    );
  });
}

export function handleGet(
  db: Database.Database,
  input: unknown,
): IpcResult<PublicNoteRow | undefined> {
  return toIpcResult(() => {
    const note = getNoteById(db, requireNumber(input, 'id'));
    return note ? toPublicNote(note) : undefined;
  });
}

export function handleUpdate(db: Database.Database, input: unknown): IpcResult<PublicNoteRow> {
  return toIpcResult(() => {
    if (!isRecord(input)) {
      throw new Error('input must be an object');
    }
    const id = requireNumber(input.id, 'id');
    return toPublicNote(
      updateNote(db, id, {
        title: optionalString(input.title, 'title'),
        content: optionalString(input.content, 'content'),
        contentPlain: optionalString(input.contentPlain, 'contentPlain'),
        labelId: optionalNullableNumber(input.labelId, 'labelId'),
      }),
    );
  });
}

export function handleList(db: Database.Database, input: unknown): IpcResult<PublicNoteRow[]> {
  return toIpcResult(() => {
    const body = isRecord(input) ? input : {};
    return listNotes(db, {
      sortBy: optionalSortField(body.sortBy),
      sortDirection: optionalSortDirection(body.sortDirection),
    }).map(toPublicNote);
  });
}

export function handleListArchived(db: Database.Database): IpcResult<PublicNoteRow[]> {
  return toIpcResult(() => listArchivedNotes(db).map(toPublicNote));
}

export function handleListTrashed(db: Database.Database): IpcResult<PublicNoteRow[]> {
  return toIpcResult(() => listTrashedNotes(db).map(toPublicNote));
}

export function handleGetCounts(db: Database.Database): IpcResult<NoteCounts> {
  return toIpcResult(() => getNoteCounts(db));
}

export function handleSetPinned(db: Database.Database, input: unknown): IpcResult<void> {
  return toIpcResult(() => {
    if (!isRecord(input)) {
      throw new Error('input must be an object');
    }
    setPinned(db, requireNumber(input.id, 'id'), requireBoolean(input.isPinned, 'isPinned'));
  });
}

export function handleSetArchived(db: Database.Database, input: unknown): IpcResult<void> {
  return toIpcResult(() => {
    if (!isRecord(input)) {
      throw new Error('input must be an object');
    }
    setArchived(db, requireNumber(input.id, 'id'), requireBoolean(input.isArchived, 'isArchived'));
  });
}

export function handleDelete(db: Database.Database, input: unknown): IpcResult<void> {
  return toIpcResult(() => softDeleteNote(db, requireNumber(input, 'id')));
}

export function handleRestore(db: Database.Database, input: unknown): IpcResult<void> {
  return toIpcResult(() => restoreNote(db, requireNumber(input, 'id')));
}

export function handlePurge(db: Database.Database, input: unknown): IpcResult<void> {
  return toIpcResult(() => purgeNote(db, requireNumber(input, 'id')));
}

export interface ExportDeps {
  showSaveDialog: (
    window: BrowserWindow | null,
    options: Electron.SaveDialogOptions,
  ) => Promise<Electron.SaveDialogReturnValue>;
  writeFile: (path: string, data: string) => Promise<void>;
  getWindow: () => BrowserWindow | null;
}

// Default deps reference the real `dialog`/`BrowserWindow`/`writeFile` only
// as *expressions*, evaluated lazily per call — so as long as callers always
// pass their own `deps` (as every test here does), these never execute and
// this file never needs `electron`'s dialog API to actually be available
// (e.g. under Vitest, where `electron` resolves to a path string, not the
// real module).
const defaultExportDeps: ExportDeps = {
  showSaveDialog: (window, options) =>
    window ? dialog.showSaveDialog(window, options) : dialog.showSaveDialog(options),
  writeFile: (path, data) => writeFile(path, data, 'utf-8'),
  getWindow: () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null,
};

// Exports a note's plain-text content to a user-chosen .txt file (FR-1.6).
// Formatting is stripped by design (FR-2.4) — content_plain, not content.
// Locked notes are refused: there's no password-verification path wired up
// yet (that's Phase 8), so exporting one now would bypass FR-4.3 entirely.
export async function handleExport(
  db: Database.Database,
  input: unknown,
  deps: ExportDeps = defaultExportDeps,
): Promise<IpcResult<{ cancelled: boolean }>> {
  return toIpcResultAsync(async () => {
    const id = requireNumber(input, 'id');
    const note = getNoteById(db, id);
    if (!note) {
      throw new Error(`Note ${id} not found`);
    }
    if (note.is_locked) {
      throw new Error('Locked notes cannot be exported yet');
    }

    const safeName = (note.title.trim() || 'Untitled').replace(/[\\/:*?"<>|]/g, '_');
    const result = await deps.showSaveDialog(deps.getWindow(), {
      defaultPath: `${safeName}.txt`,
      filters: [{ name: 'Text File', extensions: ['txt'] }],
    });

    if (result.canceled || !result.filePath) {
      return { cancelled: true };
    }

    await deps.writeFile(result.filePath, note.content_plain);
    return { cancelled: false };
  });
}

export function registerNotesHandlers(db: Database.Database): void {
  ipcMain.handle(IPC_CHANNELS.notes.create, (_event, input) => handleCreate(db, input));
  ipcMain.handle(IPC_CHANNELS.notes.get, (_event, input) => handleGet(db, input));
  ipcMain.handle(IPC_CHANNELS.notes.update, (_event, input) => handleUpdate(db, input));
  ipcMain.handle(IPC_CHANNELS.notes.list, (_event, input) => handleList(db, input));
  ipcMain.handle(IPC_CHANNELS.notes.listArchived, () => handleListArchived(db));
  ipcMain.handle(IPC_CHANNELS.notes.listTrashed, () => handleListTrashed(db));
  ipcMain.handle(IPC_CHANNELS.notes.getCounts, () => handleGetCounts(db));
  ipcMain.handle(IPC_CHANNELS.notes.setPinned, (_event, input) => handleSetPinned(db, input));
  ipcMain.handle(IPC_CHANNELS.notes.setArchived, (_event, input) => handleSetArchived(db, input));
  ipcMain.handle(IPC_CHANNELS.notes.delete, (_event, input) => handleDelete(db, input));
  ipcMain.handle(IPC_CHANNELS.notes.restore, (_event, input) => handleRestore(db, input));
  ipcMain.handle(IPC_CHANNELS.notes.purge, (_event, input) => handlePurge(db, input));
  ipcMain.handle(IPC_CHANNELS.notes.export, (_event, input) => handleExport(db, input));
}
