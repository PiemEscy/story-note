import { describe, expect, it } from 'vitest';
import {
  assignLabelToNote,
  createLabel,
  deleteLabel,
  getLabelById,
  listLabels,
  updateLabel,
} from './labels';
import { createNote, getNoteById } from './notes';
import { createTestDatabase } from './testHelpers';

describe('labels CRUD', () => {
  it('creates a label and reads it back', () => {
    const { db, close } = createTestDatabase();
    try {
      const created = createLabel(db, { name: 'Work', color: '#2563EB' });

      expect(created.name).toBe('Work');
      expect(created.color).toBe('#2563EB');
      expect(getLabelById(db, created.id)).toEqual(created);
    } finally {
      close();
    }
  });

  it('defaults color to null when not provided', () => {
    const { db, close } = createTestDatabase();
    try {
      const created = createLabel(db, { name: 'Personal' });
      expect(created.color).toBeNull();
    } finally {
      close();
    }
  });

  it('enforces unique label names', () => {
    const { db, close } = createTestDatabase();
    try {
      createLabel(db, { name: 'Work' });
      expect(() => createLabel(db, { name: 'Work' })).toThrow();
    } finally {
      close();
    }
  });

  it('lists labels alphabetically, case-insensitively', () => {
    const { db, close } = createTestDatabase();
    try {
      createLabel(db, { name: 'work' });
      createLabel(db, { name: 'Archive' });
      createLabel(db, { name: 'Personal' });

      expect(listLabels(db).map((l) => l.name)).toEqual(['Archive', 'Personal', 'work']);
    } finally {
      close();
    }
  });

  it('updateLabel changes name/color', () => {
    const { db, close } = createTestDatabase();
    try {
      const created = createLabel(db, { name: 'Work', color: '#000000' });

      const updated = updateLabel(db, created.id, { color: '#FFFFFF' });

      expect(updated.name).toBe('Work');
      expect(updated.color).toBe('#FFFFFF');
    } finally {
      close();
    }
  });

  it('deleteLabel sets label_id to null on notes instead of deleting them', () => {
    const { db, close } = createTestDatabase();
    try {
      const label = createLabel(db, { name: 'Work' });
      const note = createNote(db, { title: 'Meeting notes', labelId: label.id });

      deleteLabel(db, label.id);

      expect(getLabelById(db, label.id)).toBeUndefined();
      expect(getNoteById(db, note.id)!.label_id).toBeNull();
    } finally {
      close();
    }
  });
});

describe('assignLabelToNote', () => {
  it('assigns a label and bumps updated_at', () => {
    const { db, close } = createTestDatabase();
    try {
      const label = createLabel(db, { name: 'Work' });
      const note = createNote(db, { title: 'Untitled' });
      db.prepare('UPDATE notes SET updated_at = ? WHERE id = ?').run(
        '2020-01-01 00:00:00',
        note.id,
      );

      assignLabelToNote(db, note.id, label.id);

      const result = getNoteById(db, note.id)!;
      expect(result.label_id).toBe(label.id);
      expect(result.updated_at).not.toBe('2020-01-01 00:00:00');
    } finally {
      close();
    }
  });

  it('clears a label when passed null', () => {
    const { db, close } = createTestDatabase();
    try {
      const label = createLabel(db, { name: 'Work' });
      const note = createNote(db, { labelId: label.id });

      assignLabelToNote(db, note.id, null);

      expect(getNoteById(db, note.id)!.label_id).toBeNull();
    } finally {
      close();
    }
  });
});
