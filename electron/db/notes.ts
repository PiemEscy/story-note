import { hashSync, verifySync } from '@node-rs/argon2';
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
// `notes.id DESC` is a tiebreaker, not a real third sort key: SQLite's
// CURRENT_TIMESTAMP only has second resolution, so two notes created or
// updated within the same second would otherwise tie on every timestamp-
// based sortBy and fall back to SQLite's own unspecified tie order (a code
// review during Phase 9 flagged this as untested/undocumented; it started
// actually flipping order between runs once Phase 10 added a few more
// concurrent init calls that shift request timing slightly). id DESC keeps
// ties landing in "most recently created first" order, deterministically.
export function listNotes(db: Database.Database, options: ListNotesOptions = {}): NoteRow[] {
  const column = SORT_COLUMNS[options.sortBy ?? 'updated_at'];
  const direction = options.sortDirection === 'asc' ? 'ASC' : 'DESC';

  return db
    .prepare(
      `SELECT notes.* FROM notes
       LEFT JOIN labels ON labels.id = notes.label_id
       WHERE notes.deleted_at IS NULL AND notes.is_archived = 0
       ORDER BY notes.is_pinned DESC, ${column} ${direction}, notes.id DESC`,
    )
    .all() as NoteRow[];
}

export interface NoteCounts {
  active: number;
  archived: number;
  trash: number;
  // Per-label counts, scoped to active (non-archived, non-trashed) notes
  // only — matching what clicking a label in the Sidebar actually filters
  // to (useNoteStore.ts's labelFilter narrows the 'active' list). Labels
  // with zero active notes are simply absent, not present with a 0 value.
  byLabel: Record<number, number>;
}

// Sidebar's nav-item/label-item counts (storynote-ui-reference.html's
// .nav-count) — one query per bucket rather than a single UNION, since each
// has a distinct WHERE clause and this only runs when the sidebar's counts
// need refreshing, not on every keystroke.
export function getNoteCounts(db: Database.Database): NoteCounts {
  const active = (
    db
      .prepare('SELECT COUNT(*) as count FROM notes WHERE deleted_at IS NULL AND is_archived = 0')
      .get() as { count: number }
  ).count;
  const archived = (
    db
      .prepare('SELECT COUNT(*) as count FROM notes WHERE deleted_at IS NULL AND is_archived = 1')
      .get() as { count: number }
  ).count;
  const trash = (
    db.prepare('SELECT COUNT(*) as count FROM notes WHERE deleted_at IS NOT NULL').get() as {
      count: number;
    }
  ).count;

  const labelRows = db
    .prepare(
      `SELECT label_id, COUNT(*) as count FROM notes
       WHERE deleted_at IS NULL AND is_archived = 0 AND label_id IS NOT NULL
       GROUP BY label_id`,
    )
    .all() as { label_id: number; count: number }[];
  const byLabel: Record<number, number> = {};
  for (const row of labelRows) {
    byLabel[row.label_id] = row.count;
  }

  return { active, archived, trash, byLabel };
}

// LIKE-based search against title/content_plain (FR-5's Phase 7 scope — FTS5
// is an explicit "later, if needed" upgrade in development-plan.md, not
// required now). Always excludes soft-deleted notes; archived notes ARE
// included (schema.md's search spec only calls out deleted_at). Locked notes
// are matched here too — content_plain redaction for them (FR-5.3) is an
// IPC-boundary/presentation concern, not a query concern, so it happens in
// the handler that calls this (electron/ipc/searchHandlers.ts), same as
// password_hash's exclusion happens in toPublicNote() rather than here.
export function searchNotes(db: Database.Database, query: string): NoteRow[] {
  const trimmed = query.trim();
  if (trimmed === '') {
    return [];
  }

  const pattern = `%${trimmed}%`;
  return db
    .prepare(
      `SELECT * FROM notes
       WHERE deleted_at IS NULL AND (title LIKE ? OR content_plain LIKE ?)
       ORDER BY updated_at DESC, id DESC`,
    )
    .all(pattern, pattern) as NoteRow[];
}

export function listArchivedNotes(db: Database.Database): NoteRow[] {
  return db
    .prepare(
      'SELECT * FROM notes WHERE deleted_at IS NULL AND is_archived = 1 ORDER BY updated_at DESC, id DESC',
    )
    .all() as NoteRow[];
}

export function listTrashedNotes(db: Database.Database): NoteRow[] {
  return db
    .prepare('SELECT * FROM notes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC')
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

// Per-note password locking (FR-4). Uses @node-rs/argon2's string API
// (hashSync/verifySync — a self-contained PHC-format hash with its own
// random salt embedded), not the raw hashRawSync keys.ts uses for SQLCipher
// key derivation — that's a different problem (deriving a *key*) from this
// one (verifying a password against a stored hash). Deliberately left at the
// library's own default cost parameters rather than keys.ts's hardened ones:
// this gates in-app access to a note, not the database file's own crack
// resistance if stolen (SQLCipher, via keys.ts, already owns that job —
// architecture.md's "two independent layers"), so a fast local verify is
// the right tradeoff, not an expensive one tuned for offline attacks.
export function lockNote(db: Database.Database, id: number, password: string): NoteRow {
  const hash = hashSync(password);
  db.prepare('UPDATE notes SET is_locked = 1, password_hash = ? WHERE id = ?').run(hash, id);
  return getNoteById(db, id)!;
}

// Returns false (never throws) for a wrong password, a note that isn't
// locked, or one with no stored hash — callers can't distinguish "wrong
// password" from "not locked" from this alone, which is fine: every caller
// already knows independently whether the note is locked before calling
// this (the IPC handlers check `note.is_locked` themselves).
export function verifyNotePassword(db: Database.Database, id: number, password: string): boolean {
  const note = getNoteById(db, id);
  if (!note || !note.is_locked || !note.password_hash) {
    return false;
  }
  return verifySync(note.password_hash, password);
}

// Permanently removes a note's password (is_locked/password_hash), distinct
// from the temporary "reveal for this session" flow (see electron/db/
// lockSession.ts) — this is the "Remove lock" checklist item, not "Unlock".
export function removeNoteLock(db: Database.Database, id: number): NoteRow {
  db.prepare('UPDATE notes SET is_locked = 0, password_hash = NULL WHERE id = ?').run(id);
  return getNoteById(db, id)!;
}
