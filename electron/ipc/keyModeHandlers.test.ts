import { describe, expect, it } from 'vitest';
import { handleGetKeyMode, handleSetOsMode, handleSetPasswordMode } from './keyModeHandlers';
import { createTestDatabase, createTestCredentialIdentity } from '../db/testHelpers';
import { readKeyMetadata } from '../db/keys';

// switchToPasswordMode/switchToOsMode's own rekey mechanics (rollback on
// failure, OS-credential cleanup, ...) are already thoroughly covered in
// electron/db/keys.test.ts — these tests are about the IPC wiring layer
// only: validation, and that the right underlying function actually gets
// called with the right arguments. Every switchToOsMode/switchToPasswordMode
// call below passes a test credential identity — omitting it would touch
// this machine's real Windows Credential Manager entry.
describe('handleGetKeyMode', () => {
  it('defaults to os mode when no key metadata file exists yet', () => {
    const { userDataPath, close } = createTestDatabase();
    try {
      expect(handleGetKeyMode(userDataPath)).toEqual({ ok: true, data: 'os' });
    } finally {
      close();
    }
  });
});

describe('handleSetPasswordMode', () => {
  it('switches to password mode and is reflected by handleGetKeyMode afterward', () => {
    const identity = createTestCredentialIdentity();
    const { db, userDataPath, close } = createTestDatabase();
    try {
      const result = handleSetPasswordMode(db, userDataPath, 'a-real-password', identity);

      expect(result).toEqual({ ok: true, data: undefined });
      expect(readKeyMetadata(userDataPath).keyMode).toBe('password');
      expect(handleGetKeyMode(userDataPath)).toEqual({ ok: true, data: 'password' });
    } finally {
      close();
    }
  });

  it('rejects an empty password without touching the key mode', () => {
    const identity = createTestCredentialIdentity();
    const { db, userDataPath, close } = createTestDatabase();
    try {
      const result = handleSetPasswordMode(db, userDataPath, '', identity);

      expect(result.ok).toBe(false);
      expect(readKeyMetadata(userDataPath).keyMode).toBe('os');
    } finally {
      close();
    }
  });

  it('fails gracefully (not a thrown exception) for a non-string password', () => {
    const identity = createTestCredentialIdentity();
    const { db, userDataPath, close } = createTestDatabase();
    try {
      const result = handleSetPasswordMode(db, userDataPath, { not: 'a string' }, identity);
      expect(result.ok).toBe(false);
    } finally {
      close();
    }
  });
});

describe('handleSetOsMode', () => {
  it('switches back to os mode', () => {
    const identity = createTestCredentialIdentity();
    const { db, userDataPath, close } = createTestDatabase();
    try {
      handleSetPasswordMode(db, userDataPath, 'a-real-password', identity);

      const result = handleSetOsMode(db, userDataPath, identity);

      expect(result).toEqual({ ok: true, data: undefined });
      expect(readKeyMetadata(userDataPath).keyMode).toBe('os');
    } finally {
      close();
    }
  });
});
