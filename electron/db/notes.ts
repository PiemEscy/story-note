import type Database from 'better-sqlite3-multiple-ciphers';
import type { NoteRow } from './types';

export interface CreateNoteInput {
  title?: string;
  content?: string;
  contentPlain?: string;
  labelId?: number | null;
}

export function createNote(db: Database.Database, input: CreateNoteInput = {}): NoteRow {
  const result = db
    .prepare('INSERT INTO notes (title, content, content_plain, label_id) VALUES (?, ?, ?, ?)')
    .run(input.title ?? '', input.content ?? '', input.contentPlain ?? '', input.labelId ?? null);

  return getNoteById(db, result.lastInsertRowid as number)!;
}

export function getNoteById(db: Database.Database, id: number): NoteRow | undefined {
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow | undefined;
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  contentPlain?: string;
  labelId?: number | null;
}

// Updates title/content/label together and bumps updated_at — per
// schema.md, this is the one class of change that should. Pin/archive/
// delete toggles below deliberately do not. A no-op call (nothing actually
// different from the current row) skips the write entirely, so a future
// autosave that fires on an unchanged note can't bump updated_at for
// nothing.
export function updateNote(db: Database.Database, id: number, input: UpdateNoteInput): NoteRow {
  const current = getNoteById(db, id);
  if (!current) {
    throw new Error(`Note ${id} not found`);
  }

  const title = input.title ?? current.title;
  const content = input.content ?? current.content;
  const contentPlain = input.contentPlain ?? current.content_plain;
  const labelId = input.labelId !== undefined ? input.labelId : current.label_id;

  const unchanged =
    title === current.title &&
    content === current.content &&
    contentPlain === current.content_plain &&
    labelId === current.label_id;

  if (!unchanged) {
    db.prepare(
      `UPDATE notes
       SET title = ?, content = ?, content_plain = ?, label_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(title, content, contentPlain, labelId, id);
  }

  return getNoteById(db, id)!;
}

// The runtime-checkable form of each type below — the single source of
// truth for validating a value arriving over IPC (see electron/ipc/
// validation.ts), rather than duplicating this list at the IPC boundary.
export const NOTE_SORT_FIELDS = ['created_at', 'updated_at', 'title', 'label'] as const;
export type NoteSortField = (typeof NOTE_SORT_FIELDS)[number];

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export interface ListNotesOptions {
  sortBy?: NoteSortField;
  sortDirection?: SortDirection;
}

// Column names can't be bound parameters either; resolved through this fixed
// whitelist (keyed by the NoteSortField union) rather than ever interpolating
// a caller-supplied string directly.
const SORT_COLUMNS: Record<NoteSortField, string> = {
  created_at: 'notes.created_at',
  updated_at: 'notes.updated_at',
  title: 'notes.title',
  label: 'labels.name',
};

// Active notes only (excludes trashed and archived), pinned notes fixed
// above unpinned regardless of the chosen sort field — per FR-6.1/FR-6.2.
export function listNotes(db: Database.Database, options: ListNotesOptions = {}): NoteRow[] {
  const column = SORT_COLUMNS[options.sortBy ?? 'updated_at'];
  const direction = options.sortDirection === 'asc' ? 'ASC' : 'DESC';

  return db
    .prepare(
      `SELECT notes.* FROM notes
       LEFT JOIN labels ON labels.id = notes.label_id
       WHERE notes.deleted_at IS NULL AND notes.is_archived = 0
       ORDER BY notes.is_pinned DESC, ${column} ${direction}`,
    )
    .all() as NoteRow[];
}

export function listArchivedNotes(db: Database.Database): NoteRow[] {
  return db
    .prepare(
      'SELECT * FROM notes WHERE deleted_at IS NULL AND is_archived = 1 ORDER BY updated_at DESC',
    )
    .all() as NoteRow[];
}

export function listTrashedNotes(db: Database.Database): NoteRow[] {
  return db
    .prepare('SELECT * FROM notes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
    .all() as NoteRow[];
}

export function setPinned(db: Database.Database, id: number, isPinned: boolean): void {
  db.prepare('UPDATE notes SET is_pinned = ? WHERE id = ?').run(isPinned ? 1 : 0, id);
}

export function setArchived(db: Database.Database, id: number, isArchived: boolean): void {
  db.prepare('UPDATE notes SET is_archived = ? WHERE id = ?').run(isArchived ? 1 : 0, id);
}

export function softDeleteNote(db: Database.Database, id: number): void {
  db.prepare('UPDATE notes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
}

export function restoreNote(db: Database.Database, id: number): void {
  db.prepare('UPDATE notes SET deleted_at = NULL WHERE id = ?').run(id);
}

// Hard delete — only from the Trash view's "Delete Forever", or a future
// age-based auto-purge policy (schema.md; not yet decided/implemented).
export function purgeNote(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM notes WHERE id = ?').run(id);
}
