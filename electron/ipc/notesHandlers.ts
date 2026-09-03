import { BrowserWindow, dialog, ipcMain } from 'electron';
import { readFile, writeFile } from 'fs/promises';
import { basename, extname } from 'path';
import type Database from 'better-sqlite3-multiple-ciphers';
import {
  createNote,
  getNoteById,
  getNoteCounts,
  listArchivedNotes,
  listNotes,
  listTrashedNotes,
  lockNote,
  purgeNote,
  removeNoteLock,
  restoreNote,
  setArchived,
  setPinned,
  softDeleteNote,
  updateNote,
  verifyNotePassword,
} from '../db/notes';
import type { NoteCounts } from '../db/notes';
import type { LockSession } from '../db/lockSession';
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
  requireString,
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

// A locked note's content/content_plain never crosses the IPC boundary
// until it's been unlocked *this session* (LockSession, electron/db/
// lockSession.ts) — same allow-list philosophy as password_hash's exclusion
// below, just conditional on lock state instead of always-off. Every caller
// here passes the session's current answer for this specific note; nothing
// downstream should ever guess or trust a renderer-supplied "already
// unlocked" flag instead.
export function toPublicNote(note: NoteRow, isUnlocked: boolean): PublicNoteRow {
  const redact = note.is_locked === 1 && !isUnlocked;
  return {
    id: note.id,
    title: note.title,
    content: redact ? '' : note.content,
    content_plain: redact ? '' : note.content_plain,
    label_id: note.label_id,
    is_pinned: note.is_pinned,
    is_archived: note.is_archived,
    is_locked: note.is_locked,
    created_at: note.created_at,
    updated_at: note.updated_at,
    deleted_at: note.deleted_at,
  };
}

export function handleCreate(
  db: Database.Database,
  lockSession: LockSession,
  input: unknown,
): IpcResult<PublicNoteRow> {
  return toIpcResult(() => {
    const body = isRecord(input) ? input : {};
    const created = createNote(db, {
      title: optionalString(body.title, 'title'),
      content: optionalString(body.content, 'content'),
      contentPlain: optionalString(body.contentPlain, 'contentPlain'),
      labelId: optionalNullableNumber(body.labelId, 'labelId'),
    });
    return toPublicNote(created, lockSession.isUnlocked(created.id));
  });
}

export function handleGet(
  db: Database.Database,
  lockSession: LockSession,
  input: unknown,
): IpcResult<PublicNoteRow | undefined> {
  return toIpcResult(() => {
    const note = getNoteById(db, requireNumber(input, 'id'));
    return note ? toPublicNote(note, lockSession.isUnlocked(note.id)) : undefined;
  });
}

export function handleUpdate(
  db: Database.Database,
  lockSession: LockSession,
  input: unknown,
): IpcResult<PublicNoteRow> {
  return toIpcResult(() => {
    if (!isRecord(input)) {
      throw new Error('input must be an object');
    }
    const id = requireNumber(input.id, 'id');
    const current = getNoteById(db, id);
    if (!current) {
      throw new Error(`Note ${id} not found`);
    }
    // Block edit of a locked note without unlock (Phase 8 checklist) — title/
    // content/label are all editable via this one handler, so the whole call
    // is refused rather than trying to allow some fields and not others.
    if (current.is_locked && !lockSession.isUnlocked(id)) {
      throw new Error('Unlock this note before editing it');
    }
    const updated = updateNote(db, id, {
      title: optionalString(input.title, 'title'),
      content: optionalString(input.content, 'content'),
      contentPlain: optionalString(input.contentPlain, 'contentPlain'),
      labelId: optionalNullableNumber(input.labelId, 'labelId'),
    });
    return toPublicNote(updated, lockSession.isUnlocked(id));
  });
}

export function handleList(
  db: Database.Database,
  lockSession: LockSession,
  input: unknown,
): IpcResult<PublicNoteRow[]> {
  return toIpcResult(() => {
    const body = isRecord(input) ? input : {};
    return listNotes(db, {
      sortBy: optionalSortField(body.sortBy),
      sortDirection: optionalSortDirection(body.sortDirection),
    }).map((note) => toPublicNote(note, lockSession.isUnlocked(note.id)));
  });
}

export function handleListArchived(
  db: Database.Database,
  lockSession: LockSession,
): IpcResult<PublicNoteRow[]> {
  return toIpcResult(() =>
    listArchivedNotes(db).map((note) => toPublicNote(note, lockSession.isUnlocked(note.id))),
  );
}

export function handleListTrashed(
  db: Database.Database,
  lockSession: LockSession,
): IpcResult<PublicNoteRow[]> {
  return toIpcResult(() =>
    listTrashedNotes(db).map((note) => toPublicNote(note, lockSession.isUnlocked(note.id))),
  );
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

// Permanent purge destroys a locked note's content just as irreversibly as
// export would (schema.md's Trash section: "permanent purge or content
// export should still require the password, consistent with FR-4.3") —
// soft-delete/restore are exempt (schema.md says so explicitly; they don't
// touch content), but this does.
export function handlePurge(
  db: Database.Database,
  lockSession: LockSession,
  input: unknown,
): IpcResult<void> {
  return toIpcResult(() => {
    const id = requireNumber(input, 'id');
    const note = getNoteById(db, id);
    if (note?.is_locked && !lockSession.isUnlocked(id)) {
      throw new Error('Unlock this note before deleting it permanently');
    }
    purgeNote(db, id);
  });
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
// A locked note must be unlocked this session first (FR-4.3) — the export
// itself doesn't re-prompt for the password, since by the time it's
// reachable from the UI the note is already fully visible/editable in the
// running app; re-verifying again here wouldn't gate anything export-specific
// once view access is already granted for the rest of the session.
export async function handleExport(
  db: Database.Database,
  lockSession: LockSession,
  input: unknown,
  deps: ExportDeps = defaultExportDeps,
): Promise<IpcResult<{ cancelled: boolean }>> {
  return toIpcResultAsync(async () => {
    const id = requireNumber(input, 'id');
    const note = getNoteById(db, id);
    if (!note) {
      throw new Error(`Note ${id} not found`);
    }
    if (note.is_locked && !lockSession.isUnlocked(id)) {
      throw new Error('Unlock this note before exporting it');
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

export interface ImportDeps {
  showOpenDialog: (
    window: BrowserWindow | null,
    options: Electron.OpenDialogOptions,
  ) => Promise<Electron.OpenDialogReturnValue>;
  readFile: (path: string) => Promise<string>;
  getWindow: () => BrowserWindow | null;
}

// Same lazy-evaluation reasoning as defaultExportDeps above — only executes
// if a caller omits `deps`, which no test here ever does.
const defaultImportDeps: ImportDeps = {
  showOpenDialog: (window, options) =>
    window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options),
  readFile: (path) => readFile(path, 'utf-8'),
  getWindow: () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null,
};

export interface ImportFailure {
  fileName: string;
  message: string;
}

export interface ImportResult {
  cancelled: boolean;
  imported: PublicNoteRow[];
  failed: ImportFailure[];
}

// Node's readFile('utf-8') passes a UTF-8 BOM through as a literal
// character rather than stripping it — left alone, it'd show up as a stray
// character at the very start of the imported note.
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// Minimal TipTap doc JSON for a plain-text import — one paragraph per line,
// rather than reusing the plain-string "legacy content" fallback
// (useNoteEditor.ts's parseStoredContent), which hands the raw string to
// TipTap as HTML and doesn't reliably preserve line breaks as paragraphs.
// An empty line becomes an empty paragraph (no `content` field, matching
// what editor.getJSON() itself produces for one); an empty file still needs
// exactly one paragraph, since TipTap's doc schema requires at least one
// block node.
function plainTextToDoc(text: string): { type: 'doc'; content: Array<Record<string, unknown>> } {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const paragraphs = lines.map((line) =>
    line.length > 0
      ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
      : { type: 'paragraph' },
  );
  return { type: 'doc', content: paragraphs.length > 0 ? paragraphs : [{ type: 'paragraph' }] };
}

// Imports one or more .txt files as new notes (FR-import) — title from each
// file's name (extension stripped), full content becomes the note body with
// no formatting applied (plain-text source). Each file is read and created
// independently so one bad file (permission error, mid-batch deletion, ...)
// doesn't abort the rest of the batch; per-file failures are collected and
// returned alongside whatever did succeed rather than thrown, since a
// partial batch import is a normal, expected outcome here, not a fatal error.
export async function handleImport(
  db: Database.Database,
  lockSession: LockSession,
  input: unknown,
  deps: ImportDeps = defaultImportDeps,
): Promise<IpcResult<ImportResult>> {
  return toIpcResultAsync(async () => {
    const labelId = optionalNullableNumber(input, 'defaultLabelId') ?? null;

    const dialogResult = await deps.showOpenDialog(deps.getWindow(), {
      filters: [{ name: 'Text File', extensions: ['txt'] }],
      properties: ['openFile', 'multiSelections'],
    });

    if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
      return { cancelled: true, imported: [], failed: [] };
    }

    const imported: PublicNoteRow[] = [];
    const failed: ImportFailure[] = [];

    for (const filePath of dialogResult.filePaths) {
      const fileName = basename(filePath);
      try {
        const raw = stripBom(await deps.readFile(filePath));
        const title = basename(filePath, extname(filePath));
        const created = createNote(db, {
          title,
          content: JSON.stringify(plainTextToDoc(raw)),
          contentPlain: raw,
          labelId,
        });
        imported.push(toPublicNote(created, lockSession.isUnlocked(created.id)));
      } catch (error) {
        failed.push({
          fileName,
          message: error instanceof Error ? error.message : 'Failed to read file',
        });
      }
    }

    return { cancelled: false, imported, failed };
  });
}

// Sets a new password on a not-yet-locked note. Immediately marks it
// unlocked for this session too — the user was just viewing/editing it live
// to get here, so re-prompting them for the password they *just* chose would
// gate nothing; it only matters again on the next launch.
//
// SECURITY: must refuse an already-locked note the caller hasn't unlocked
// this session — without this check anyone could call notes:lock(id, 'x')
// on someone else's locked note to overwrite its password_hash with their
// own choice *and* get the real content_plain back in the same response
// (lockNote() only touches is_locked/password_hash, never the content
// columns), a full bypass of the entire locking feature. A security-audit
// review caught this as the original implementation's one Critical finding.
export function handleLock(
  db: Database.Database,
  lockSession: LockSession,
  input: unknown,
): IpcResult<PublicNoteRow> {
  return toIpcResult(() => {
    if (!isRecord(input)) {
      throw new Error('input must be an object');
    }
    const id = requireNumber(input.id, 'id');
    const password = requireString(input.password, 'password');
    if (password.length === 0) {
      throw new Error('Password cannot be empty');
    }
    const current = getNoteById(db, id);
    if (!current) {
      throw new Error(`Note ${id} not found`);
    }
    if (current.is_locked && !lockSession.isUnlocked(id)) {
      throw new Error('Unlock this note before changing its lock');
    }
    const updated = lockNote(db, id, password);
    lockSession.unlock(id);
    return toPublicNote(updated, true);
  });
}

// Shared by handleUnlock/handleRemoveLock, both of which are a password
// guess against the same note: throws "not found"/"not locked"/lockout/
// wrong-password (-> { ok: false, message } via toIpcResult), or does
// nothing on success — the caller decides what "success" means (unlock vs.
// also clearing the lock). Repeated wrong guesses against one note are
// capped (LockSession.isLockedOut) — a security-audit review noted argon2's
// verify cost here is deliberately fast (notes.ts), so this counter is what
// actually bounds someone at an already-unlocked machine scripting guesses
// against a specific note's password.
function verifyOrThrow(
  db: Database.Database,
  lockSession: LockSession,
  note: NoteRow,
  password: string,
): void {
  if (!note.is_locked) {
    throw new Error('Note is not locked');
  }
  if (lockSession.isLockedOut(note.id)) {
    throw new Error('Too many incorrect attempts — restart the app to try again');
  }
  if (!verifyNotePassword(db, note.id, password)) {
    lockSession.recordFailedAttempt(note.id);
    throw new Error('Incorrect password');
  }
}

// Temporary reveal (Phase 8's "Unlock flow") — verifies the password and, on
// success, marks the note unlocked for the rest of this session without
// touching is_locked/password_hash at all.
export function handleUnlock(
  db: Database.Database,
  lockSession: LockSession,
  input: unknown,
): IpcResult<PublicNoteRow> {
  return toIpcResult(() => {
    if (!isRecord(input)) {
      throw new Error('input must be an object');
    }
    const id = requireNumber(input.id, 'id');
    const password = requireString(input.password, 'password');
    const note = getNoteById(db, id);
    if (!note) {
      throw new Error(`Note ${id} not found`);
    }
    verifyOrThrow(db, lockSession, note, password);
    lockSession.unlock(id);
    return toPublicNote(note, true);
  });
}

// "Remove lock" — a self-contained action, not dependent on having already
// gone through handleUnlock in this session: re-verifies the password itself
// (Phase 8's "Remove lock after successful verification") before permanently
// clearing is_locked/password_hash.
export function handleRemoveLock(
  db: Database.Database,
  lockSession: LockSession,
  input: unknown,
): IpcResult<PublicNoteRow> {
  return toIpcResult(() => {
    if (!isRecord(input)) {
      throw new Error('input must be an object');
    }
    const id = requireNumber(input.id, 'id');
    const password = requireString(input.password, 'password');
    const note = getNoteById(db, id);
    if (!note) {
      throw new Error(`Note ${id} not found`);
    }
    verifyOrThrow(db, lockSession, note, password);
    const updated = removeNoteLock(db, id);
    // Inert for redaction purposes (toPublicNote only redacts when
    // is_locked === 1, and removeNoteLock() just cleared it to 0) — kept for
    // the failed-attempt-counter reset unlock() also performs, so a note
    // whose lock was just removed doesn't carry a stale lockout into any
    // future re-lock of the same note.id.
    lockSession.unlock(id);
    return toPublicNote(updated, true);
  });
}

export function registerNotesHandlers(db: Database.Database, lockSession: LockSession): void {
  ipcMain.handle(IPC_CHANNELS.notes.create, (_event, input) =>
    handleCreate(db, lockSession, input),
  );
  ipcMain.handle(IPC_CHANNELS.notes.get, (_event, input) => handleGet(db, lockSession, input));
  ipcMain.handle(IPC_CHANNELS.notes.update, (_event, input) =>
    handleUpdate(db, lockSession, input),
  );
  ipcMain.handle(IPC_CHANNELS.notes.list, (_event, input) => handleList(db, lockSession, input));
  ipcMain.handle(IPC_CHANNELS.notes.listArchived, () => handleListArchived(db, lockSession));
  ipcMain.handle(IPC_CHANNELS.notes.listTrashed, () => handleListTrashed(db, lockSession));
  ipcMain.handle(IPC_CHANNELS.notes.getCounts, () => handleGetCounts(db));
  ipcMain.handle(IPC_CHANNELS.notes.setPinned, (_event, input) => handleSetPinned(db, input));
  ipcMain.handle(IPC_CHANNELS.notes.setArchived, (_event, input) => handleSetArchived(db, input));
  ipcMain.handle(IPC_CHANNELS.notes.delete, (_event, input) => handleDelete(db, input));
  ipcMain.handle(IPC_CHANNELS.notes.restore, (_event, input) => handleRestore(db, input));
  ipcMain.handle(IPC_CHANNELS.notes.purge, (_event, input) => handlePurge(db, lockSession, input));
  ipcMain.handle(IPC_CHANNELS.notes.export, (_event, input) =>
    handleExport(db, lockSession, input),
  );
  ipcMain.handle(IPC_CHANNELS.notes.import, (_event, input) =>
    handleImport(db, lockSession, input),
  );
  ipcMain.handle(IPC_CHANNELS.notes.lock, (_event, input) => handleLock(db, lockSession, input));
  ipcMain.handle(IPC_CHANNELS.notes.unlock, (_event, input) =>
    handleUnlock(db, lockSession, input),
  );
  ipcMain.handle(IPC_CHANNELS.notes.removeLock, (_event, input) =>
    handleRemoveLock(db, lockSession, input),
  );
}
