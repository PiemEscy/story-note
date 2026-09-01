import { describe, expect, it } from 'vitest';
import { createLockSession } from './lockSession';

describe('createLockSession', () => {
  it('a note is not unlocked until unlock() is called for it', () => {
    const session = createLockSession();

    expect(session.isUnlocked(1)).toBe(false);
    session.unlock(1);
    expect(session.isUnlocked(1)).toBe(true);
  });

  it('unlocking one note does not affect another', () => {
    const session = createLockSession();

    session.unlock(1);

    expect(session.isUnlocked(1)).toBe(true);
    expect(session.isUnlocked(2)).toBe(false);
  });

  it('unlock() is idempotent', () => {
    const session = createLockSession();

    session.unlock(1);
    session.unlock(1);

    expect(session.isUnlocked(1)).toBe(true);
  });

  it('is not locked out before any failed attempts', () => {
    const session = createLockSession();

    expect(session.isLockedOut(1)).toBe(false);
  });

  it('locks out a note after enough recorded failed attempts, independent of other notes', () => {
    const session = createLockSession();

    for (let i = 0; i < 10; i++) {
      session.recordFailedAttempt(1);
    }

    expect(session.isLockedOut(1)).toBe(true);
    expect(session.isLockedOut(2)).toBe(false);
  });

  it('unlocking a note resets its failed-attempt count', () => {
    const session = createLockSession();
    for (let i = 0; i < 10; i++) {
      session.recordFailedAttempt(1);
    }

    session.unlock(1);

    expect(session.isLockedOut(1)).toBe(false);
  });

  it('lockAll re-locks every unlocked note at once', () => {
    const session = createLockSession();
    session.unlock(1);
    session.unlock(2);

    session.lockAll();

    expect(session.isUnlocked(1)).toBe(false);
    expect(session.isUnlocked(2)).toBe(false);
  });

  it('lockAll does not reset a note’s failed-attempt count (not a response to a wrong guess)', () => {
    const session = createLockSession();
    for (let i = 0; i < 5; i++) {
      session.recordFailedAttempt(1);
    }

    session.lockAll();
    session.recordFailedAttempt(1);
    for (let i = 0; i < 4; i++) {
      session.recordFailedAttempt(1);
    }

    expect(session.isLockedOut(1)).toBe(true);
  });
});
