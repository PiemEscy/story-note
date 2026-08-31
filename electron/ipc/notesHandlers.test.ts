import { describe, expect, it, vi } from 'vitest';
import { createTestDatabase } from '../db/testHelpers';
import type { ExportDeps } from './notesHandlers';
import {
  handleCreate,
  handleDelete,
  handleExport,
  handleGet,
  handleGetCounts,
  handleList,
  handleListArchived,
  handleListTrashed,
  handlePurge,
  handleRestore,
  handleSetArchived,
  handleSetPinned,
  handleUpdate,
} from './notesHandlers';

function fakeExportDeps(overrides: Partial<ExportDeps> = {}): ExportDeps {
  return {
    showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: 'C:\\out.txt' }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    getWindow: vi.fn().mockReturnValue(null),
    ...overrides,
  };
}

describe('notes IPC handlers — password_hash never crosses the wire', () => {
  it('excludes password_hash from create/get/update/list results', () => {
    const { db, close } = createTestDatabase();
    try {
      const created = handleCreate(db, { title: 'Sensitive note' });
      if (!created.ok) throw new Error('setup failed');
      expect(created.data).not.toHaveProperty('password_hash');

      const fetched = handleGet(db, created.data.id);
      if (fetched.ok) expect(fetched.data).not.toHaveProperty('password_hash');

      const updated = handleUpdate(db, { id: created.data.id, title: 'Still sensitive' });
      if (updated.ok) expect(updated.data).not.toHaveProperty('password_hash');

      const listed = handleList(db, {});
      if (listed.ok) {
        for (const note of listed.data) {
          expect(note).not.toHaveProperty('password_hash');
        }
      }
    } finally {
      close();
    }
  });
});

describe('notes IPC handlers — happy path', () => {
  it('creates, reads, updates, lists, pins, archives, soft-deletes, restores, and purges a note', () => {
    const { db, close } = createTestDatabase();
    try {
      const created = handleCreate(db, { title: 'Groceries' });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const id = created.data.id;

      expect(handleGet(db, id)).toEqual({ ok: true, data: created.data });

      const updated = handleUpdate(db, { id, title: 'Groceries v2' });
      expect(updated).toEqual({
        ok: true,
        data: expect.objectContaining({ title: 'Groceries v2' }),
      });

      const listed = handleList(db, {});
      expect(listed.ok).toBe(true);
      if (listed.ok) expect(listed.data.map((n) => n.id)).toContain(id);

      expect(handleSetPinned(db, { id, isPinned: true })).toEqual({ ok: true, data: undefined });
      expect(handleSetArchived(db, { id, isArchived: true })).toEqual({
        ok: true,
        data: undefined,
      });

      const archived = handleListArchived(db);
      expect(archived.ok).toBe(true);
      if (archived.ok) expect(archived.data.map((n) => n.id)).toContain(id);

      expect(handleDelete(db, id)).toEqual({ ok: true, data: undefined });

      const trashed = handleListTrashed(db);
      expect(trashed.ok).toBe(true);
      if (trashed.ok) expect(trashed.data.map((n) => n.id)).toContain(id);

      expect(handleRestore(db, id)).toEqual({ ok: true, data: undefined });
      expect(handlePurge(db, id)).toEqual({ ok: true, data: undefined });
      expect(handleGet(db, id)).toEqual({ ok: true, data: undefined });
    } finally {
      close();
    }
  });
});

describe('notes IPC handlers — malformed input fails gracefully', () => {
  it('handleCreate rejects a non-string title instead of throwing', () => {
    const { db, close } = createTestDatabase();
    try {
      const result = handleCreate(db, { title: 42 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/title/);
    } finally {
      close();
    }
  });

  it('handleGet rejects a non-numeric id', () => {
    const { db, close } = createTestDatabase();
    try {
      const result = handleGet(db, 'not-an-id');
      expect(result).toEqual({ ok: false, message: expect.stringMatching(/id/) });
    } finally {
      close();
    }
  });

  it('handleGet rejects entirely malformed input (an array, a class instance) without throwing', () => {
    const { db, close } = createTestDatabase();
    try {
      expect(handleGet(db, [1, 2, 3]).ok).toBe(false);
      expect(handleGet(db, null).ok).toBe(false);
      expect(handleGet(db, undefined).ok).toBe(false);
    } finally {
      close();
    }
  });

  it('handleUpdate rejects input missing an id', () => {
    const { db, close } = createTestDatabase();
    try {
      const result = handleUpdate(db, { title: 'no id here' });
      expect(result.ok).toBe(false);
    } finally {
      close();
    }
  });

  it('handleUpdate on a non-existent note fails gracefully, not with a thrown exception', () => {
    const { db, close } = createTestDatabase();
    try {
      const result = handleUpdate(db, { id: 999999, title: 'ghost' });
      expect(result).toEqual({ ok: false, message: expect.stringMatching(/not found/) });
    } finally {
      close();
    }
  });

  it('handleList rejects an unrecognized sortBy instead of letting it reach SQL', () => {
    const { db, close } = createTestDatabase();
    try {
      const result = handleList(db, { sortBy: 'id; DROP TABLE notes;--' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/sortBy/);
    } finally {
      close();
    }
  });

  it('handleSetPinned rejects a non-boolean isPinned', () => {
    const { db, close } = createTestDatabase();
    try {
      const created = handleCreate(db, {});
      if (!created.ok) throw new Error('setup failed');
      const result = handleSetPinned(db, { id: created.data.id, isPinned: 'yes' });
      expect(result.ok).toBe(false);
    } finally {
      close();
    }
  });

  it('handleDelete/Restore/Purge reject a missing id', () => {
    const { db, close } = createTestDatabase();
    try {
      expect(handleDelete(db, undefined).ok).toBe(false);
      expect(handleRestore(db, undefined).ok).toBe(false);
      expect(handlePurge(db, undefined).ok).toBe(false);
    } finally {
      close();
    }
  });
});

describe('handleExport', () => {
  it('writes the note content_plain to the chosen path', async () => {
    const { db, close } = createTestDatabase();
    try {
      const created = handleCreate(db, {
        title: 'My Note',
        content: '<p>hi</p>',
        contentPlain: 'hi',
      });
      if (!created.ok) throw new Error('setup failed');

      const deps = fakeExportDeps();
      const result = await handleExport(db, created.data.id, deps);

      expect(result).toEqual({ ok: true, data: { cancelled: false } });
      expect(deps.showSaveDialog).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ defaultPath: 'My Note.txt' }),
      );
      expect(deps.writeFile).toHaveBeenCalledWith('C:\\out.txt', 'hi');
    } finally {
      close();
    }
  });

  it('sanitizes filesystem-unsafe characters out of the default filename', async () => {
    const { db, close } = createTestDatabase();
    try {
      const created = handleCreate(db, { title: 'Q3: "Plan" / Review?' });
      if (!created.ok) throw new Error('setup failed');

      const deps = fakeExportDeps();
      await handleExport(db, created.data.id, deps);

      expect(deps.showSaveDialog).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ defaultPath: 'Q3_ _Plan_ _ Review_.txt' }),
      );
    } finally {
      close();
    }
  });

  it('falls back to "Untitled" for a note with no title', async () => {
    const { db, close } = createTestDatabase();
    try {
      const created = handleCreate(db, {});
      if (!created.ok) throw new Error('setup failed');

      const deps = fakeExportDeps();
      await handleExport(db, created.data.id, deps);

      expect(deps.showSaveDialog).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ defaultPath: 'Untitled.txt' }),
      );
    } finally {
      close();
    }
  });

  it('reports cancelled without writing when the user dismisses the dialog', async () => {
    const { db, close } = createTestDatabase();
    try {
      const created = handleCreate(db, { title: 'Note' });
      if (!created.ok) throw new Error('setup failed');

      const deps = fakeExportDeps({
        showSaveDialog: vi.fn().mockResolvedValue({ canceled: true, filePath: undefined }),
      });
      const result = await handleExport(db, created.data.id, deps);

      expect(result).toEqual({ ok: true, data: { cancelled: true } });
      expect(deps.writeFile).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });

  it('refuses to export a locked note without ever opening the dialog', async () => {
    const { db, close } = createTestDatabase();
    try {
      const created = handleCreate(db, { title: 'Secret' });
      if (!created.ok) throw new Error('setup failed');
      db.prepare('UPDATE notes SET is_locked = 1 WHERE id = ?').run(created.data.id);

      const deps = fakeExportDeps();
      const result = await handleExport(db, created.data.id, deps);

      expect(result.ok).toBe(false);
      expect(deps.showSaveDialog).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });

  it('fails gracefully for a non-existent note', async () => {
    const { db, close } = createTestDatabase();
    try {
      const result = await handleExport(db, 999999, fakeExportDeps());
      expect(result.ok).toBe(false);
    } finally {
      close();
    }
  });
});

describe('handleGetCounts', () => {
  it('returns active/archived/trash/byLabel counts', () => {
    const { db, close } = createTestDatabase();
    try {
      handleCreate(db, { title: 'active' });
      const archived = handleCreate(db, { title: 'archived' });
      if (archived.ok) handleSetArchived(db, { id: archived.data.id, isArchived: true });

      const result = handleGetCounts(db);

      expect(result).toEqual({
        ok: true,
        data: { active: 1, archived: 1, trash: 0, byLabel: {} },
      });
    } finally {
      close();
    }
  });
});
