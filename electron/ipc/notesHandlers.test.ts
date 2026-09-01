import { describe, expect, it, vi } from 'vitest';
import { createTestDatabase } from '../db/testHelpers';
import { createLockSession } from '../db/lockSession';
import { verifyNotePassword } from '../db/notes';
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
  handleLock,
  handlePurge,
  handleRemoveLock,
  handleRestore,
  handleSetArchived,
  handleSetPinned,
  handleUnlock,
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
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, { title: 'Sensitive note' });
      if (!created.ok) throw new Error('setup failed');
      expect(created.data).not.toHaveProperty('password_hash');

      const fetched = handleGet(db, lockSession, created.data.id);
      if (fetched.ok) expect(fetched.data).not.toHaveProperty('password_hash');

      const updated = handleUpdate(db, lockSession, {
        id: created.data.id,
        title: 'Still sensitive',
      });
      if (updated.ok) expect(updated.data).not.toHaveProperty('password_hash');

      const listed = handleList(db, lockSession, {});
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
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, { title: 'Groceries' });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const id = created.data.id;

      expect(handleGet(db, lockSession, id)).toEqual({ ok: true, data: created.data });

      const updated = handleUpdate(db, lockSession, { id, title: 'Groceries v2' });
      expect(updated).toEqual({
        ok: true,
        data: expect.objectContaining({ title: 'Groceries v2' }),
      });

      const listed = handleList(db, lockSession, {});
      expect(listed.ok).toBe(true);
      if (listed.ok) expect(listed.data.map((n) => n.id)).toContain(id);

      expect(handleSetPinned(db, { id, isPinned: true })).toEqual({ ok: true, data: undefined });
      expect(handleSetArchived(db, { id, isArchived: true })).toEqual({
        ok: true,
        data: undefined,
      });

      const archived = handleListArchived(db, lockSession);
      expect(archived.ok).toBe(true);
      if (archived.ok) expect(archived.data.map((n) => n.id)).toContain(id);

      expect(handleDelete(db, id)).toEqual({ ok: true, data: undefined });

      const trashed = handleListTrashed(db, lockSession);
      expect(trashed.ok).toBe(true);
      if (trashed.ok) expect(trashed.data.map((n) => n.id)).toContain(id);

      expect(handleRestore(db, id)).toEqual({ ok: true, data: undefined });
      expect(handlePurge(db, lockSession, id)).toEqual({ ok: true, data: undefined });
      expect(handleGet(db, lockSession, id)).toEqual({ ok: true, data: undefined });
    } finally {
      close();
    }
  });
});

describe('notes IPC handlers — malformed input fails gracefully', () => {
  it('handleCreate rejects a non-string title instead of throwing', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const result = handleCreate(db, lockSession, { title: 42 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/title/);
    } finally {
      close();
    }
  });

  it('handleGet rejects a non-numeric id', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const result = handleGet(db, lockSession, 'not-an-id');
      expect(result).toEqual({ ok: false, message: expect.stringMatching(/id/) });
    } finally {
      close();
    }
  });

  it('handleGet rejects entirely malformed input (an array, a class instance) without throwing', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      expect(handleGet(db, lockSession, [1, 2, 3]).ok).toBe(false);
      expect(handleGet(db, lockSession, null).ok).toBe(false);
      expect(handleGet(db, lockSession, undefined).ok).toBe(false);
    } finally {
      close();
    }
  });

  it('handleUpdate rejects input missing an id', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const result = handleUpdate(db, lockSession, { title: 'no id here' });
      expect(result.ok).toBe(false);
    } finally {
      close();
    }
  });

  it('handleUpdate on a non-existent note fails gracefully, not with a thrown exception', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const result = handleUpdate(db, lockSession, { id: 999999, title: 'ghost' });
      expect(result).toEqual({ ok: false, message: expect.stringMatching(/not found/) });
    } finally {
      close();
    }
  });

  it('handleList rejects an unrecognized sortBy instead of letting it reach SQL', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const result = handleList(db, lockSession, { sortBy: 'id; DROP TABLE notes;--' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/sortBy/);
    } finally {
      close();
    }
  });

  it('handleSetPinned rejects a non-boolean isPinned', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, {});
      if (!created.ok) throw new Error('setup failed');
      const result = handleSetPinned(db, { id: created.data.id, isPinned: 'yes' });
      expect(result.ok).toBe(false);
    } finally {
      close();
    }
  });

  it('handleDelete/Restore/Purge reject a missing id', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      expect(handleDelete(db, undefined).ok).toBe(false);
      expect(handleRestore(db, undefined).ok).toBe(false);
      expect(handlePurge(db, lockSession, undefined).ok).toBe(false);
    } finally {
      close();
    }
  });
});

describe('a locked note is redacted until unlocked this session', () => {
  it('handleGet/handleList/handleListArchived/handleListTrashed redact content/content_plain for a locked note', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, {
        title: 'Secret',
        content: '<p>the real secret</p>',
        contentPlain: 'the real secret',
      });
      if (!created.ok) throw new Error('setup failed');
      const id = created.data.id;
      db.prepare('UPDATE notes SET is_locked = 1 WHERE id = ?').run(id);

      const fetched = handleGet(db, lockSession, id);
      if (!fetched.ok || !fetched.data) throw new Error('unreachable');
      expect(fetched.data.content).toBe('');
      expect(fetched.data.content_plain).toBe('');
      expect(fetched.data.is_locked).toBe(1);
      // Title is never redacted — locked notes still show/match by title.
      expect(fetched.data.title).toBe('Secret');

      const listed = handleList(db, lockSession, {});
      if (!listed.ok) throw new Error('unreachable');
      expect(listed.data.find((n) => n.id === id)?.content_plain).toBe('');
    } finally {
      close();
    }
  });

  it('shows the real content again once the note has been unlocked this session', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, {
        title: 'Secret',
        contentPlain: 'the real secret',
      });
      if (!created.ok) throw new Error('setup failed');
      const id = created.data.id;
      db.prepare('UPDATE notes SET is_locked = 1 WHERE id = ?').run(id);
      lockSession.unlock(id);

      const fetched = handleGet(db, lockSession, id);
      if (!fetched.ok || !fetched.data) throw new Error('unreachable');
      expect(fetched.data.content_plain).toBe('the real secret');
    } finally {
      close();
    }
  });
});

describe('editing/deleting a locked note is blocked until unlocked', () => {
  it('handleUpdate refuses to edit a locked note until unlocked', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, { title: 'Secret' });
      if (!created.ok) throw new Error('setup failed');
      const id = created.data.id;
      db.prepare('UPDATE notes SET is_locked = 1 WHERE id = ?').run(id);

      const result = handleUpdate(db, lockSession, { id, title: 'Tampered' });
      expect(result.ok).toBe(false);

      // Confirm it genuinely didn't write through.
      const fetched = handleGet(db, lockSession, id);
      expect(fetched.ok && fetched.data?.title).toBe('Secret');
    } finally {
      close();
    }
  });

  it('handleUpdate succeeds once the note has been unlocked this session', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, { title: 'Secret' });
      if (!created.ok) throw new Error('setup failed');
      const id = created.data.id;
      db.prepare('UPDATE notes SET is_locked = 1 WHERE id = ?').run(id);
      lockSession.unlock(id);

      const result = handleUpdate(db, lockSession, { id, title: 'Edited' });
      expect(result).toEqual({ ok: true, data: expect.objectContaining({ title: 'Edited' }) });
    } finally {
      close();
    }
  });

  it('handlePurge refuses to permanently delete a locked note until unlocked (schema.md, FR-4.3)', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, { title: 'Secret' });
      if (!created.ok) throw new Error('setup failed');
      const id = created.data.id;
      db.prepare('UPDATE notes SET is_locked = 1 WHERE id = ?').run(id);

      const result = handlePurge(db, lockSession, id);
      expect(result.ok).toBe(false);
      expect(handleGet(db, lockSession, id).ok && true).toBe(true);
    } finally {
      close();
    }
  });

  it('handlePurge succeeds once the note has been unlocked this session', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, { title: 'Secret' });
      if (!created.ok) throw new Error('setup failed');
      const id = created.data.id;
      db.prepare('UPDATE notes SET is_locked = 1 WHERE id = ?').run(id);
      lockSession.unlock(id);

      expect(handlePurge(db, lockSession, id)).toEqual({ ok: true, data: undefined });
      const fetched = handleGet(db, lockSession, id);
      expect(fetched.ok && fetched.data).toBeUndefined();
    } finally {
      close();
    }
  });
});

describe('handleExport', () => {
  it('writes the note content_plain to the chosen path', async () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, {
        title: 'My Note',
        content: '<p>hi</p>',
        contentPlain: 'hi',
      });
      if (!created.ok) throw new Error('setup failed');

      const deps = fakeExportDeps();
      const result = await handleExport(db, lockSession, created.data.id, deps);

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
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, { title: 'Q3: "Plan" / Review?' });
      if (!created.ok) throw new Error('setup failed');

      const deps = fakeExportDeps();
      await handleExport(db, lockSession, created.data.id, deps);

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
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, {});
      if (!created.ok) throw new Error('setup failed');

      const deps = fakeExportDeps();
      await handleExport(db, lockSession, created.data.id, deps);

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
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, { title: 'Note' });
      if (!created.ok) throw new Error('setup failed');

      const deps = fakeExportDeps({
        showSaveDialog: vi.fn().mockResolvedValue({ canceled: true, filePath: undefined }),
      });
      const result = await handleExport(db, lockSession, created.data.id, deps);

      expect(result).toEqual({ ok: true, data: { cancelled: true } });
      expect(deps.writeFile).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });

  it('refuses to export a locked note without ever opening the dialog', async () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, { title: 'Secret' });
      if (!created.ok) throw new Error('setup failed');
      db.prepare('UPDATE notes SET is_locked = 1 WHERE id = ?').run(created.data.id);

      const deps = fakeExportDeps();
      const result = await handleExport(db, lockSession, created.data.id, deps);

      expect(result.ok).toBe(false);
      expect(deps.showSaveDialog).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });

  it('allows exporting a locked note once it has been unlocked this session (FR-4.3)', async () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, {
        title: 'Secret',
        contentPlain: 'the real secret',
      });
      if (!created.ok) throw new Error('setup failed');
      db.prepare('UPDATE notes SET is_locked = 1 WHERE id = ?').run(created.data.id);
      lockSession.unlock(created.data.id);

      const deps = fakeExportDeps();
      const result = await handleExport(db, lockSession, created.data.id, deps);

      expect(result).toEqual({ ok: true, data: { cancelled: false } });
      expect(deps.writeFile).toHaveBeenCalledWith('C:\\out.txt', 'the real secret');
    } finally {
      close();
    }
  });

  it('fails gracefully for a non-existent note', async () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const result = await handleExport(db, lockSession, 999999, fakeExportDeps());
      expect(result.ok).toBe(false);
    } finally {
      close();
    }
  });
});

describe('handleGetCounts', () => {
  it('returns active/archived/trash/byLabel counts', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      handleCreate(db, lockSession, { title: 'active' });
      const archived = handleCreate(db, lockSession, { title: 'archived' });
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

describe('handleLock', () => {
  it('sets is_locked and a non-plaintext password_hash, and reveals the note for this session', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, {
        title: 'Secret',
        contentPlain: 'the real secret',
      });
      if (!created.ok) throw new Error('setup failed');
      const id = created.data.id;

      const result = handleLock(db, lockSession, { id, password: 'hunter2' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.is_locked).toBe(1);
      // The just-locked note stays revealed for the rest of this session —
      // re-prompting for the password just chosen would gate nothing.
      expect(result.data.content_plain).toBe('the real secret');
      expect(result.data).not.toHaveProperty('password_hash');

      // The stored hash is never the plaintext password, and is a real
      // argon2 PHC string, not some placeholder.
      const raw = db.prepare('SELECT password_hash FROM notes WHERE id = ?').get(id) as {
        password_hash: string;
      };
      expect(raw.password_hash).not.toBe('hunter2');
      expect(raw.password_hash).not.toContain('hunter2');
      expect(raw.password_hash).toMatch(/^\$argon2/);

      expect(lockSession.isUnlocked(id)).toBe(true);
    } finally {
      close();
    }
  });

  it('rejects an empty password', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, { title: 'Secret' });
      if (!created.ok) throw new Error('setup failed');

      const result = handleLock(db, lockSession, { id: created.data.id, password: '' });
      expect(result.ok).toBe(false);
    } finally {
      close();
    }
  });

  it('does not bump updated_at (organizational, not a content edit — schema.md)', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, { title: 'Secret' });
      if (!created.ok) throw new Error('setup failed');
      const id = created.data.id;
      db.prepare("UPDATE notes SET updated_at = '2020-01-01 00:00:00' WHERE id = ?").run(id);

      handleLock(db, lockSession, { id, password: 'hunter2' });

      const raw = db.prepare('SELECT updated_at FROM notes WHERE id = ?').get(id) as {
        updated_at: string;
      };
      expect(raw.updated_at).toBe('2020-01-01 00:00:00');
    } finally {
      close();
    }
  });

  // Regression test for a security-audit finding: the original handleLock had
  // no guard at all, so anyone could call notes:lock(id, 'anything') on a
  // note they'd never unlocked — silently overwriting the real password_hash
  // with their own choice AND getting the real content_plain back in the same
  // response (lockNote() never touches content, so it was still the genuine
  // text). This is the exact scenario that must now be refused.
  it('refuses to re-lock an already-locked note that has not been unlocked this session', () => {
    const { db, close } = createTestDatabase();
    const ownerSession = createLockSession();
    try {
      const created = handleCreate(db, ownerSession, {
        title: 'Secret',
        contentPlain: 'the real secret',
      });
      if (!created.ok) throw new Error('setup failed');
      const id = created.data.id;
      handleLock(db, ownerSession, { id, password: 'owner-password' });

      // An attacker with no knowledge of the password, in a session that has
      // never unlocked this note.
      const attackerSession = createLockSession();
      const result = handleLock(db, attackerSession, { id, password: 'attacker-password' });

      expect(result.ok).toBe(false);
      expect(attackerSession.isUnlocked(id)).toBe(false);

      // The real password must still work — it was never overwritten.
      expect(verifyNotePassword(db, id, 'owner-password')).toBe(true);
      expect(verifyNotePassword(db, id, 'attacker-password')).toBe(false);

      // And the content must never have been exposed to the attacker's
      // session via this call.
      const fetched = handleGet(db, attackerSession, id);
      expect(fetched.ok && fetched.data?.content_plain).toBe('');
    } finally {
      close();
    }
  });

  it('allows changing the password once the note has been unlocked this session', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, { title: 'Secret' });
      if (!created.ok) throw new Error('setup failed');
      const id = created.data.id;
      handleLock(db, lockSession, { id, password: 'old-password' });

      const result = handleLock(db, lockSession, { id, password: 'new-password' });

      expect(result.ok).toBe(true);
      expect(verifyNotePassword(db, id, 'new-password')).toBe(true);
      expect(verifyNotePassword(db, id, 'old-password')).toBe(false);
    } finally {
      close();
    }
  });

  it('fails gracefully (not a raw thrown error) for a non-existent note', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const result = handleLock(db, lockSession, { id: 999999, password: 'anything' });
      expect(result).toEqual({ ok: false, message: expect.stringMatching(/not found/) });
    } finally {
      close();
    }
  });
});

describe('handleUnlock', () => {
  it('reveals the note for the correct password', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, {
        title: 'Secret',
        contentPlain: 'the real secret',
      });
      if (!created.ok) throw new Error('setup failed');
      const id = created.data.id;
      handleLock(db, lockSession, { id, password: 'hunter2' });
      // A fresh session — handleLock above already unlocked it in this same
      // lockSession instance, so start a new one to test unlock in isolation.
      const freshSession = createLockSession();

      const result = handleUnlock(db, freshSession, { id, password: 'hunter2' });
      expect(result).toEqual({
        ok: true,
        data: expect.objectContaining({ content_plain: 'the real secret', is_locked: 1 }),
      });
      expect(freshSession.isUnlocked(id)).toBe(true);
    } finally {
      close();
    }
  });

  it('rejects an incorrect password without revealing the note', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, {
        title: 'Secret',
        contentPlain: 'the real secret',
      });
      if (!created.ok) throw new Error('setup failed');
      const id = created.data.id;
      handleLock(db, lockSession, { id, password: 'hunter2' });
      const freshSession = createLockSession();

      const result = handleUnlock(db, freshSession, { id, password: 'wrong-password' });
      expect(result.ok).toBe(false);
      expect(freshSession.isUnlocked(id)).toBe(false);

      // Content must still be redacted after a failed attempt.
      const fetched = handleGet(db, freshSession, id);
      expect(fetched.ok && fetched.data?.content_plain).toBe('');
    } finally {
      close();
    }
  });

  it('rejects unlocking a note that is not locked', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, { title: 'Not locked' });
      if (!created.ok) throw new Error('setup failed');

      const result = handleUnlock(db, lockSession, {
        id: created.data.id,
        password: 'anything',
      });
      expect(result.ok).toBe(false);
    } finally {
      close();
    }
  });

  // Repeated wrong guesses against one note are capped (LockSession's
  // isLockedOut) — argon2's own verify cost is deliberately fast (notes.ts),
  // so this is what actually bounds scripted guessing against one note's
  // password (a security-audit review flagged the original absence of any
  // limit here).
  it('locks out further attempts against one note after enough incorrect guesses', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, { title: 'Secret' });
      if (!created.ok) throw new Error('setup failed');
      const id = created.data.id;
      handleLock(db, lockSession, { id, password: 'hunter2' });
      const freshSession = createLockSession();

      for (let i = 0; i < 10; i++) {
        const attempt = handleUnlock(db, freshSession, { id, password: 'wrong' });
        expect(attempt.ok).toBe(false);
      }

      // The 11th attempt is refused outright, even with the correct password.
      const result = handleUnlock(db, freshSession, { id, password: 'hunter2' });
      expect(result.ok).toBe(false);
      expect(freshSession.isUnlocked(id)).toBe(false);
    } finally {
      close();
    }
  });

  it('a successful unlock resets the failed-attempt counter for that note', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, { title: 'Secret' });
      if (!created.ok) throw new Error('setup failed');
      const id = created.data.id;
      handleLock(db, lockSession, { id, password: 'hunter2' });
      const freshSession = createLockSession();

      handleUnlock(db, freshSession, { id, password: 'wrong' });
      handleUnlock(db, freshSession, { id, password: 'hunter2' });

      expect(freshSession.isUnlocked(id)).toBe(true);
      expect(freshSession.isLockedOut(id)).toBe(false);
    } finally {
      close();
    }
  });
});

describe('handleRemoveLock', () => {
  it('permanently clears is_locked/password_hash for the correct password', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, { title: 'Secret' });
      if (!created.ok) throw new Error('setup failed');
      const id = created.data.id;
      handleLock(db, lockSession, { id, password: 'hunter2' });

      const result = handleRemoveLock(db, lockSession, { id, password: 'hunter2' });
      expect(result).toEqual({ ok: true, data: expect.objectContaining({ is_locked: 0 }) });

      const raw = db.prepare('SELECT password_hash FROM notes WHERE id = ?').get(id) as {
        password_hash: string | null;
      };
      expect(raw.password_hash).toBeNull();
    } finally {
      close();
    }
  });

  it('rejects an incorrect password, leaving the note locked', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const created = handleCreate(db, lockSession, { title: 'Secret' });
      if (!created.ok) throw new Error('setup failed');
      const id = created.data.id;
      handleLock(db, lockSession, { id, password: 'hunter2' });

      const result = handleRemoveLock(db, lockSession, { id, password: 'wrong-password' });
      expect(result.ok).toBe(false);

      const raw = db.prepare('SELECT is_locked FROM notes WHERE id = ?').get(id) as {
        is_locked: number;
      };
      expect(raw.is_locked).toBe(1);
    } finally {
      close();
    }
  });
});
