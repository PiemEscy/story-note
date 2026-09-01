import { describe, expect, it } from 'vitest';
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
  searchNotes,
  setArchived,
  setPinned,
  softDeleteNote,
  updateNote,
  verifyNotePassword,
} from './notes';
import { createTestDatabase } from './testHelpers';
import type Database from 'better-sqlite3-multiple-ciphers';

const SENTINEL_TIMESTAMP = '2020-01-01 00:00:00';

function setUpdatedAt(db: Database.Database, id: number, timestamp: string): void {
  db.prepare('UPDATE notes SET updated_at = ? WHERE id = ?').run(timestamp, id);
}

describe('notes CRUD', () => {
  it('creates a note and reads it back', () => {
    const { db, close } = createTestDatabase();
    try {
      const created = createNote(db, { title: 'Grocery list', content: '<p>milk</p>' });

      expect(created.title).toBe('Grocery list');
      expect(created.content).toBe('<p>milk</p>');
      expect(created.is_pinned).toBe(0);
      expect(created.is_archived).toBe(0);
      expect(created.deleted_at).toBeNull();

      expect(getNoteById(db, created.id)).toEqual(created);
    } finally {
      close();
    }
  });

  it('defaults title/content/content_plain to empty strings', () => {
    const { db, close } = createTestDatabase();
    try {
      const created = createNote(db);
      expect(created.title).toBe('');
      expect(created.content).toBe('');
      expect(created.content_plain).toBe('');
    } finally {
      close();
    }
  });

  it('updateNote changes title/content/label and bumps updated_at', () => {
    const { db, close } = createTestDatabase();
    try {
      const note = createNote(db, { title: 'Old title' });
      setUpdatedAt(db, note.id, SENTINEL_TIMESTAMP);

      const updated = updateNote(db, note.id, { title: 'New title' });

      expect(updated.title).toBe('New title');
      expect(updated.updated_at).not.toBe(SENTINEL_TIMESTAMP);
    } finally {
      close();
    }
  });

  it('updateNote is a no-op (does not bump updated_at) when nothing actually changed', () => {
    const { db, close } = createTestDatabase();
    try {
      const note = createNote(db, { title: 'Same title', content: 'Same content' });
      setUpdatedAt(db, note.id, SENTINEL_TIMESTAMP);

      const result = updateNote(db, note.id, { title: 'Same title', content: 'Same content' });

      expect(result.updated_at).toBe(SENTINEL_TIMESTAMP);
    } finally {
      close();
    }
  });

  it('updateNote can explicitly clear the label with null', () => {
    const { db, close } = createTestDatabase();
    try {
      db.prepare('INSERT INTO labels (id, name) VALUES (1, ?)').run('Work');
      const note = createNote(db, { labelId: 1 });

      const updated = updateNote(db, note.id, { labelId: null });

      expect(updated.label_id).toBeNull();
    } finally {
      close();
    }
  });
});

describe('pin/archive — do not bump updated_at', () => {
  it('setPinned leaves updated_at untouched', () => {
    const { db, close } = createTestDatabase();
    try {
      const note = createNote(db);
      setUpdatedAt(db, note.id, SENTINEL_TIMESTAMP);

      setPinned(db, note.id, true);

      const result = getNoteById(db, note.id)!;
      expect(result.is_pinned).toBe(1);
      expect(result.updated_at).toBe(SENTINEL_TIMESTAMP);
    } finally {
      close();
    }
  });

  it('setArchived leaves updated_at untouched', () => {
    const { db, close } = createTestDatabase();
    try {
      const note = createNote(db);
      setUpdatedAt(db, note.id, SENTINEL_TIMESTAMP);

      setArchived(db, note.id, true);

      const result = getNoteById(db, note.id)!;
      expect(result.is_archived).toBe(1);
      expect(result.updated_at).toBe(SENTINEL_TIMESTAMP);
    } finally {
      close();
    }
  });
});

describe('soft-delete / trash', () => {
  it('softDeleteNote sets deleted_at and excludes the note from listNotes, without bumping updated_at', () => {
    const { db, close } = createTestDatabase();
    try {
      const note = createNote(db);
      setUpdatedAt(db, note.id, SENTINEL_TIMESTAMP);

      softDeleteNote(db, note.id);

      const result = getNoteById(db, note.id)!;
      expect(result.deleted_at).not.toBeNull();
      expect(result.updated_at).toBe(SENTINEL_TIMESTAMP);
      expect(listNotes(db).map((n) => n.id)).not.toContain(note.id);
    } finally {
      close();
    }
  });

  it('restoreNote clears deleted_at and the note reappears in listNotes', () => {
    const { db, close } = createTestDatabase();
    try {
      const note = createNote(db);
      softDeleteNote(db, note.id);

      restoreNote(db, note.id);

      expect(getNoteById(db, note.id)!.deleted_at).toBeNull();
      expect(listNotes(db).map((n) => n.id)).toContain(note.id);
    } finally {
      close();
    }
  });

  it('purgeNote actually removes the row', () => {
    const { db, close } = createTestDatabase();
    try {
      const note = createNote(db);
      softDeleteNote(db, note.id);

      purgeNote(db, note.id);

      expect(getNoteById(db, note.id)).toBeUndefined();
    } finally {
      close();
    }
  });

  it('listTrashedNotes only returns soft-deleted notes', () => {
    const { db, close } = createTestDatabase();
    try {
      const active = createNote(db, { title: 'active' });
      const trashed = createNote(db, { title: 'trashed' });
      softDeleteNote(db, trashed.id);

      const result = listTrashedNotes(db).map((n) => n.id);
      expect(result).toContain(trashed.id);
      expect(result).not.toContain(active.id);
    } finally {
      close();
    }
  });
});

describe('archive view', () => {
  it('listNotes excludes archived notes; listArchivedNotes returns only them', () => {
    const { db, close } = createTestDatabase();
    try {
      const normal = createNote(db, { title: 'normal' });
      const archived = createNote(db, { title: 'archived' });
      setArchived(db, archived.id, true);

      expect(listNotes(db).map((n) => n.id)).toEqual([normal.id]);
      expect(listArchivedNotes(db).map((n) => n.id)).toEqual([archived.id]);
    } finally {
      close();
    }
  });
});

describe('listNotes sorting', () => {
  it('keeps pinned notes above unpinned regardless of sort field', () => {
    const { db, close } = createTestDatabase();
    try {
      const a = createNote(db, { title: 'B note' });
      const b = createNote(db, { title: 'A note' });
      setPinned(db, a.id, true);

      const result = listNotes(db, { sortBy: 'title', sortDirection: 'asc' });

      expect(result[0].id).toBe(a.id);
      expect(result[1].id).toBe(b.id);
    } finally {
      close();
    }
  });

  it('sorts by title', () => {
    const { db, close } = createTestDatabase();
    try {
      createNote(db, { title: 'Banana' });
      createNote(db, { title: 'Apple' });

      const titles = listNotes(db, { sortBy: 'title', sortDirection: 'asc' }).map((n) => n.title);
      expect(titles).toEqual(['Apple', 'Banana']);
    } finally {
      close();
    }
  });

  it('sorts by label name', () => {
    const { db, close } = createTestDatabase();
    try {
      db.prepare('INSERT INTO labels (id, name) VALUES (1, ?), (2, ?)').run('Work', 'Personal');
      createNote(db, { title: 'Work note', labelId: 1 });
      createNote(db, { title: 'Personal note', labelId: 2 });

      const titles = listNotes(db, { sortBy: 'label', sortDirection: 'asc' }).map((n) => n.title);
      // "Personal" < "Work" alphabetically
      expect(titles).toEqual(['Personal note', 'Work note']);
    } finally {
      close();
    }
  });

  it('defaults to sorting by updated_at descending', () => {
    const { db, close } = createTestDatabase();
    try {
      const older = createNote(db, { title: 'older' });
      const newer = createNote(db, { title: 'newer' });
      setUpdatedAt(db, older.id, '2020-01-01 00:00:00');
      setUpdatedAt(db, newer.id, '2024-01-01 00:00:00');

      const result = listNotes(db).map((n) => n.id);
      expect(result).toEqual([newer.id, older.id]);
    } finally {
      close();
    }
  });

  it('sorts by created_at', () => {
    const { db, close } = createTestDatabase();
    try {
      const older = createNote(db, { title: 'older' });
      const newer = createNote(db, { title: 'newer' });
      db.prepare("UPDATE notes SET created_at = '2020-01-01 00:00:00' WHERE id = ?").run(older.id);
      db.prepare("UPDATE notes SET created_at = '2024-01-01 00:00:00' WHERE id = ?").run(newer.id);
      // updated_at intentionally left untouched (identical for both), so
      // this can only pass if created_at — not the default column — actually
      // drove the ordering.
      const ascending = listNotes(db, { sortBy: 'created_at', sortDirection: 'asc' }).map(
        (n) => n.id,
      );
      const descending = listNotes(db, { sortBy: 'created_at', sortDirection: 'desc' }).map(
        (n) => n.id,
      );

      expect(ascending).toEqual([older.id, newer.id]);
      expect(descending).toEqual([newer.id, older.id]);
    } finally {
      close();
    }
  });
});

describe('searchNotes', () => {
  it('matches against title', () => {
    const { db, close } = createTestDatabase();
    try {
      const match = createNote(db, { title: 'Grocery list', content: '<p>eggs</p>' });
      createNote(db, { title: 'Unrelated', content: '<p>nothing here</p>' });

      expect(searchNotes(db, 'grocery').map((n) => n.id)).toEqual([match.id]);
    } finally {
      close();
    }
  });

  it('matches against content_plain', () => {
    const { db, close } = createTestDatabase();
    try {
      const match = createNote(db, { title: 'Notes', contentPlain: 'buy oat milk' });
      createNote(db, { title: 'Other', contentPlain: 'nothing relevant' });

      expect(searchNotes(db, 'oat milk').map((n) => n.id)).toEqual([match.id]);
    } finally {
      close();
    }
  });

  it('is case-insensitive', () => {
    const { db, close } = createTestDatabase();
    try {
      const match = createNote(db, { title: 'Roadmap' });

      expect(searchNotes(db, 'ROADMAP').map((n) => n.id)).toEqual([match.id]);
    } finally {
      close();
    }
  });

  it('excludes soft-deleted notes', () => {
    const { db, close } = createTestDatabase();
    try {
      const trashed = createNote(db, { title: 'Trashed roadmap' });
      softDeleteNote(db, trashed.id);

      expect(searchNotes(db, 'roadmap')).toEqual([]);
    } finally {
      close();
    }
  });

  it('includes archived notes', () => {
    const { db, close } = createTestDatabase();
    try {
      const archived = createNote(db, { title: 'Archived roadmap' });
      setArchived(db, archived.id, true);

      expect(searchNotes(db, 'roadmap').map((n) => n.id)).toEqual([archived.id]);
    } finally {
      close();
    }
  });

  it('returns an empty array for a blank query without touching the database', () => {
    const { db, close } = createTestDatabase();
    try {
      createNote(db, { title: 'Anything' });

      expect(searchNotes(db, '')).toEqual([]);
      expect(searchNotes(db, '   ')).toEqual([]);
    } finally {
      close();
    }
  });

  it('treats a SQL-injection-shaped query as a literal, parameterized string', () => {
    const { db, close } = createTestDatabase();
    try {
      createNote(db, { title: 'Safe note' });

      expect(() => searchNotes(db, "'; DROP TABLE notes; --")).not.toThrow();
      expect(searchNotes(db, "'; DROP TABLE notes; --")).toEqual([]);
      // The table must still exist and be queryable afterward.
      expect(listNotes(db)).toHaveLength(1);
    } finally {
      close();
    }
  });
});

describe('getNoteCounts', () => {
  it('counts active, archived, and trashed notes separately', () => {
    const { db, close } = createTestDatabase();
    try {
      createNote(db, { title: 'active' });
      const archived = createNote(db, { title: 'archived' });
      setArchived(db, archived.id, true);
      const trashed = createNote(db, { title: 'trashed' });
      softDeleteNote(db, trashed.id);

      expect(getNoteCounts(db)).toMatchObject({ active: 1, archived: 1, trash: 1 });
    } finally {
      close();
    }
  });

  it('counts notes per label, scoped to active notes only', () => {
    const { db, close } = createTestDatabase();
    try {
      db.prepare('INSERT INTO labels (id, name) VALUES (1, ?), (2, ?)').run('Work', 'Personal');
      createNote(db, { title: 'Work note 1', labelId: 1 });
      createNote(db, { title: 'Work note 2', labelId: 1 });
      createNote(db, { title: 'Personal note', labelId: 2 });
      createNote(db, { title: 'No label' });

      // An archived note with a label shouldn't count toward that label's
      // active count — matches useNoteStore.ts's labelFilter, which only
      // ever narrows the 'active' list.
      const archivedWorkNote = createNote(db, { title: 'Archived work note', labelId: 1 });
      setArchived(db, archivedWorkNote.id, true);

      expect(getNoteCounts(db).byLabel).toEqual({ 1: 2, 2: 1 });
    } finally {
      close();
    }
  });

  it('omits labels with zero active notes rather than including a 0 entry', () => {
    const { db, close } = createTestDatabase();
    try {
      db.prepare('INSERT INTO labels (id, name) VALUES (1, ?)').run('Unused');

      expect(getNoteCounts(db).byLabel).toEqual({});
    } finally {
      close();
    }
  });
});

describe('lockNote / verifyNotePassword / removeNoteLock', () => {
  it('lockNote sets is_locked and a real, non-plaintext argon2 hash', () => {
    const { db, close } = createTestDatabase();
    try {
      const note = createNote(db, { title: 'Secret' });

      const locked = lockNote(db, note.id, 'hunter2');

      expect(locked.is_locked).toBe(1);
      expect(locked.password_hash).not.toBeNull();
      expect(locked.password_hash).not.toBe('hunter2');
      expect(locked.password_hash).not.toContain('hunter2');
      expect(locked.password_hash).toMatch(/^\$argon2/);
    } finally {
      close();
    }
  });

  it('lockNote does not bump updated_at (organizational, not a content edit)', () => {
    const { db, close } = createTestDatabase();
    try {
      const note = createNote(db, { title: 'Secret' });
      setUpdatedAt(db, note.id, SENTINEL_TIMESTAMP);

      lockNote(db, note.id, 'hunter2');

      expect(getNoteById(db, note.id)!.updated_at).toBe(SENTINEL_TIMESTAMP);
    } finally {
      close();
    }
  });

  it('verifyNotePassword returns true for the correct password and false for an incorrect one', () => {
    const { db, close } = createTestDatabase();
    try {
      const note = createNote(db, { title: 'Secret' });
      lockNote(db, note.id, 'hunter2');

      expect(verifyNotePassword(db, note.id, 'hunter2')).toBe(true);
      expect(verifyNotePassword(db, note.id, 'wrong-password')).toBe(false);
    } finally {
      close();
    }
  });

  it('verifyNotePassword returns false (never throws) for a note that is not locked', () => {
    const { db, close } = createTestDatabase();
    try {
      const note = createNote(db, { title: 'Not locked' });

      expect(verifyNotePassword(db, note.id, 'anything')).toBe(false);
    } finally {
      close();
    }
  });

  it('removeNoteLock clears both is_locked and password_hash', () => {
    const { db, close } = createTestDatabase();
    try {
      const note = createNote(db, { title: 'Secret' });
      lockNote(db, note.id, 'hunter2');

      const result = removeNoteLock(db, note.id);

      expect(result.is_locked).toBe(0);
      expect(result.password_hash).toBeNull();
      // The old password no longer verifies against anything, by construction —
      // there's no hash left to check it against.
      expect(verifyNotePassword(db, note.id, 'hunter2')).toBe(false);
    } finally {
      close();
    }
  });
});
