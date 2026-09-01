import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../db/testHelpers';
import { createLockSession } from '../db/lockSession';
import {
  handleAssign,
  handleCreate,
  handleDelete,
  handleList,
  handleUpdate,
} from './labelsHandlers';
import { handleCreate as handleCreateNote, handleGet as handleGetNote } from './notesHandlers';

describe('labels IPC handlers — happy path', () => {
  it('creates, lists, updates, assigns, and deletes a label', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, { name: 'Work', color: '#2563EB' });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const labelId = created.data.id;

      const listed = handleList(db);
      expect(listed.ok).toBe(true);
      if (listed.ok) expect(listed.data.map((l) => l.id)).toContain(labelId);

      const updated = handleUpdate(db, { id: labelId, color: '#000000' });
      expect(updated).toEqual({ ok: true, data: expect.objectContaining({ color: '#000000' }) });

      const note = handleCreateNote(db, lockSession, {});
      if (!note.ok) throw new Error('setup failed');
      const assigned = handleAssign(db, lockSession, { noteId: note.data.id, labelId });
      expect(assigned).toEqual({
        ok: true,
        data: expect.objectContaining({ id: note.data.id, label_id: labelId }),
      });
      const fetched = handleGetNote(db, lockSession, note.data.id);
      if (fetched.ok) expect(fetched.data?.label_id).toBe(labelId);

      expect(handleDelete(db, labelId)).toEqual({ ok: true, data: undefined });
      // deleting the label clears it from the note rather than deleting the note
      const afterDelete = handleGetNote(db, lockSession, note.data.id);
      if (afterDelete.ok) expect(afterDelete.data?.label_id).toBeNull();
    } finally {
      close();
    }
  });
});

describe('labels IPC handlers — malformed input fails gracefully', () => {
  it('handleCreate rejects a missing name', () => {
    const { db, close } = createTestDatabase();
    try {
      const result = handleCreate(db, { color: '#000000' });
      expect(result.ok).toBe(false);
    } finally {
      close();
    }
  });

  it('handleCreate rejects a duplicate name without throwing (unique constraint)', () => {
    const { db, close } = createTestDatabase();
    try {
      handleCreate(db, { name: 'Work' });
      const result = handleCreate(db, { name: 'Work' });
      expect(result.ok).toBe(false);
    } finally {
      close();
    }
  });

  it('handleUpdate on a non-existent label fails gracefully', () => {
    const { db, close } = createTestDatabase();
    try {
      const result = handleUpdate(db, { id: 999999, name: 'ghost' });
      expect(result).toEqual({ ok: false, message: expect.stringMatching(/not found/) });
    } finally {
      close();
    }
  });

  it('handleAssign rejects a labelId that is neither a number nor null', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const note = handleCreateNote(db, lockSession, {});
      if (!note.ok) throw new Error('setup failed');
      const result = handleAssign(db, lockSession, {
        noteId: note.data.id,
        labelId: 'not-a-number',
      });
      expect(result.ok).toBe(false);
    } finally {
      close();
    }
  });

  it('handleDelete rejects a missing id', () => {
    const { db, close } = createTestDatabase();
    try {
      expect(handleDelete(db, undefined).ok).toBe(false);
    } finally {
      close();
    }
  });
});

describe('handleAssign on a locked note', () => {
  it('still succeeds without unlocking (organizational, not content — schema.md), but redacts the response', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const label = handleCreate(db, { name: 'Personal' });
      if (!label.ok) throw new Error('setup failed');

      const note = handleCreateNote(db, lockSession, { contentPlain: 'the real secret' });
      if (!note.ok) throw new Error('setup failed');
      db.prepare('UPDATE notes SET is_locked = 1 WHERE id = ?').run(note.data.id);

      const result = handleAssign(db, lockSession, {
        noteId: note.data.id,
        labelId: label.data.id,
      });
      expect(result).toEqual({
        ok: true,
        data: expect.objectContaining({ label_id: label.data.id, content_plain: '' }),
      });
    } finally {
      close();
    }
  });
});
