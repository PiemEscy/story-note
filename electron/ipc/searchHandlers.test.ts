import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../db/testHelpers';
import { createNote } from '../db/notes';
import { createLockSession } from '../db/lockSession';
import { handleSearchQuery } from './searchHandlers';

describe('handleSearchQuery', () => {
  it('returns notes matching title or content_plain', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const match = createNote(db, { title: 'Roadmap', contentPlain: 'Q3 plans' });
      createNote(db, { title: 'Unrelated', contentPlain: 'nothing here' });

      const result = handleSearchQuery(db, lockSession, 'roadmap');
      if (!result.ok) throw new Error('unreachable');
      expect(result.data.map((n) => n.id)).toEqual([match.id]);
    } finally {
      close();
    }
  });

  it('excludes password_hash from results, same as every other note handler', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      createNote(db, { title: 'Sensitive note' });

      const result = handleSearchQuery(db, lockSession, 'sensitive');
      if (!result.ok) throw new Error('unreachable');
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).not.toHaveProperty('password_hash');
    } finally {
      close();
    }
  });

  it('FR-5.3: still matches and shows the title of a locked note, but redacts content_plain', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const note = createNote(db, { title: 'Locked secrets', contentPlain: 'the actual secret' });
      db.prepare('UPDATE notes SET is_locked = 1 WHERE id = ?').run(note.id);

      const result = handleSearchQuery(db, lockSession, 'locked secrets');
      if (!result.ok) throw new Error('unreachable');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toBe('Locked secrets');
      expect(result.data[0].content_plain).toBe('');
    } finally {
      close();
    }
  });

  it('FR-5.3: a locked note matched only by its content never leaks that content', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const note = createNote(db, { title: 'Locked', contentPlain: 'super secret passphrase' });
      db.prepare('UPDATE notes SET is_locked = 1 WHERE id = ?').run(note.id);

      const result = handleSearchQuery(db, lockSession, 'passphrase');
      if (!result.ok) throw new Error('unreachable');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].content_plain).toBe('');
      expect(JSON.stringify(result.data)).not.toContain('passphrase');
    } finally {
      close();
    }
  });

  it('shows real content_plain again for a locked note once unlocked this session (architecture.md)', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const note = createNote(db, { title: 'Locked', contentPlain: 'no longer a secret' });
      db.prepare('UPDATE notes SET is_locked = 1 WHERE id = ?').run(note.id);
      lockSession.unlock(note.id);

      const result = handleSearchQuery(db, lockSession, 'secret');
      if (!result.ok) throw new Error('unreachable');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].content_plain).toBe('no longer a secret');
    } finally {
      close();
    }
  });

  it('rejects a non-string query rather than throwing an unhandled exception', () => {
    const { db, close } = createTestDatabase();
    const lockSession = createLockSession();
    try {
      const result = handleSearchQuery(db, lockSession, { not: 'a string' });
      expect(result.ok).toBe(false);
    } finally {
      close();
    }
  });
});
