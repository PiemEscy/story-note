import { existsSync, writeFileSync } from 'fs';
import { Entry } from '@napi-rs/keyring';
import { describe, expect, it } from 'vitest';
import {
  assertHexKey,
  clearKeyFromOS,
  CredentialMissingError,
  generateSalt,
  getKeyFromOS,
  getKeyFromPassword,
  PasswordRequiredError,
  readKeyMetadata,
  resolveEncryptionKey,
  storeKeyInOS,
  switchToOsMode,
  switchToPasswordMode,
  writeKeyMetadata,
} from './keys';
import { getKeyMetadataPath } from './getKeyMetadataPath';
import {
  createEmptyUserDataDir,
  createTestCredentialIdentity,
  createTestDatabase,
} from './testHelpers';

describe('assertHexKey', () => {
  it('accepts a 64-character hex string', () => {
    expect(() => assertHexKey('a'.repeat(64))).not.toThrow();
  });

  it('rejects anything that is not a 64-character hex string', () => {
    expect(() => assertHexKey('not-hex')).toThrow();
    expect(() => assertHexKey('a'.repeat(63))).toThrow();
  });
});

describe('generateSalt', () => {
  it('produces a 32-character hex string (16 bytes)', () => {
    expect(generateSalt()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is different on every call', () => {
    expect(generateSalt()).not.toBe(generateSalt());
  });
});

describe('getKeyFromPassword', () => {
  it('is deterministic for the same password and salt', () => {
    const salt = generateSalt();
    expect(getKeyFromPassword('correct horse battery staple', salt)).toBe(
      getKeyFromPassword('correct horse battery staple', salt),
    );
  });

  it('produces a different key for a different salt', () => {
    expect(getKeyFromPassword('same password', generateSalt())).not.toBe(
      getKeyFromPassword('same password', generateSalt()),
    );
  });

  it('produces a different key for a different password', () => {
    const salt = generateSalt();
    expect(getKeyFromPassword('password one', salt)).not.toBe(
      getKeyFromPassword('password two', salt),
    );
  });

  it('returns a valid hex key', () => {
    expect(() => assertHexKey(getKeyFromPassword('anything', generateSalt()))).not.toThrow();
  });
});

describe('OS credential storage', () => {
  it('generates and persists a key on first access (fresh install, no db file yet)', () => {
    const identity = createTestCredentialIdentity();
    const { userDataPath, cleanup } = createEmptyUserDataDir();
    try {
      const first = getKeyFromOS(userDataPath, identity);
      const second = getKeyFromOS(userDataPath, identity);
      expect(first).toBe(second);
      expect(() => assertHexKey(first)).not.toThrow();
    } finally {
      clearKeyFromOS(identity);
      cleanup();
    }
  });

  it('generates a new key after being cleared', () => {
    const identity = createTestCredentialIdentity();
    const { userDataPath, cleanup } = createEmptyUserDataDir();
    try {
      const first = getKeyFromOS(userDataPath, identity);
      clearKeyFromOS(identity);
      const second = getKeyFromOS(userDataPath, identity);
      expect(second).not.toBe(first);
    } finally {
      clearKeyFromOS(identity);
      cleanup();
    }
  });

  it('storeKeyInOS overwrites the stored key', () => {
    const identity = createTestCredentialIdentity();
    const { userDataPath, cleanup } = createEmptyUserDataDir();
    const explicitKey = 'b'.repeat(64);
    try {
      storeKeyInOS(explicitKey, identity);
      expect(getKeyFromOS(userDataPath, identity)).toBe(explicitKey);
    } finally {
      clearKeyFromOS(identity);
      cleanup();
    }
  });

  it('throws CredentialMissingError (not: silently generates a new key) when a database already exists', () => {
    const identity = createTestCredentialIdentity();
    const { db, userDataPath, close } = createTestDatabase();
    try {
      db.close(); // the db file itself now exists on disk, connection just isn't open
      expect(() => getKeyFromOS(userDataPath, identity)).toThrow(CredentialMissingError);
    } finally {
      clearKeyFromOS(identity);
      close();
    }
  });
});

describe('key metadata', () => {
  it('defaults to os mode when no metadata file exists yet', () => {
    const { userDataPath, close } = createTestDatabase();
    try {
      expect(readKeyMetadata(userDataPath)).toEqual({ keyMode: 'os' });
    } finally {
      close();
    }
  });

  it('round-trips written metadata', () => {
    const { userDataPath, close } = createTestDatabase();
    try {
      const salt = generateSalt();
      writeKeyMetadata(userDataPath, { keyMode: 'password', keyDerivationSalt: salt });
      expect(readKeyMetadata(userDataPath)).toEqual({
        keyMode: 'password',
        keyDerivationSalt: salt,
      });
    } finally {
      close();
    }
  });

  it('writeKeyMetadata does not leave a .tmp file behind (atomic write)', () => {
    const { userDataPath, close } = createTestDatabase();
    try {
      writeKeyMetadata(userDataPath, { keyMode: 'os' });
      const tempPath = `${getKeyMetadataPath(userDataPath)}.tmp`;
      expect(existsSync(tempPath)).toBe(false);
    } finally {
      close();
    }
  });

  it('readKeyMetadata throws a clear error on a corrupt file instead of a raw JSON.parse error', () => {
    const { userDataPath, close } = createTestDatabase();
    try {
      writeFileSync(getKeyMetadataPath(userDataPath), '{not valid json', 'utf-8');
      expect(() => readKeyMetadata(userDataPath)).toThrow(/corrupt or unreadable/);
    } finally {
      close();
    }
  });
});

describe('resolveEncryptionKey', () => {
  it('uses the OS-stored key by default', () => {
    // No db file needed here — this test only checks that resolveEncryptionKey
    // delegates to getKeyFromOS in 'os' mode, independent of any connection.
    const { userDataPath, cleanup } = createEmptyUserDataDir();
    const identity = createTestCredentialIdentity();
    try {
      const expected = getKeyFromOS(userDataPath, identity);
      expect(resolveEncryptionKey(userDataPath, undefined, identity)).toBe(expected);
    } finally {
      clearKeyFromOS(identity);
      cleanup();
    }
  });

  it('throws PasswordRequiredError in password mode with no password given', () => {
    const { userDataPath, close } = createTestDatabase();
    try {
      writeKeyMetadata(userDataPath, { keyMode: 'password', keyDerivationSalt: generateSalt() });
      expect(() => resolveEncryptionKey(userDataPath)).toThrow(PasswordRequiredError);
    } finally {
      close();
    }
  });

  it('derives the key from the password and stored salt in password mode', () => {
    const { userDataPath, close } = createTestDatabase();
    try {
      const salt = generateSalt();
      writeKeyMetadata(userDataPath, { keyMode: 'password', keyDerivationSalt: salt });
      expect(resolveEncryptionKey(userDataPath, 'hunter2')).toBe(
        getKeyFromPassword('hunter2', salt),
      );
    } finally {
      close();
    }
  });
});

describe('mode switching', () => {
  it('switchToPasswordMode rekeys the database and clears the OS credential', () => {
    const identity = createTestCredentialIdentity();
    const { db, userDataPath, close } = createTestDatabase();
    try {
      storeKeyInOS('c'.repeat(64), identity); // simulate an existing OS-stored key before switching

      switchToPasswordMode(db, userDataPath, 'new-master-password', identity);

      expect(() => db.prepare('SELECT 1').get()).not.toThrow();
      expect(readKeyMetadata(userDataPath).keyMode).toBe('password');
      expect(new Entry(identity.service!, identity.account!).getPassword()).toBeNull();
    } finally {
      clearKeyFromOS(identity);
      close();
    }
  });

  it('switchToOsMode rekeys the database and stores a new OS key', () => {
    const identity = createTestCredentialIdentity();
    const { db, userDataPath, close } = createTestDatabase();
    try {
      switchToOsMode(db, userDataPath, identity);

      expect(() => db.prepare('SELECT 1').get()).not.toThrow();
      expect(readKeyMetadata(userDataPath).keyMode).toBe('os');
      expect(getKeyFromOS(userDataPath, identity)).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      clearKeyFromOS(identity);
      close();
    }
  });

  it('switchToPasswordMode rolls metadata back to os mode if rekey fails, rather than leaving it stuck claiming password mode', () => {
    const identity = createTestCredentialIdentity();
    const { db, userDataPath, close } = createTestDatabase();
    try {
      db.close(); // force the subsequent PRAGMA rekey call to throw

      expect(() => switchToPasswordMode(db, userDataPath, 'irrelevant', identity)).toThrow();

      expect(readKeyMetadata(userDataPath)).toEqual({ keyMode: 'os' });
    } finally {
      clearKeyFromOS(identity);
      close();
    }
  });

  it('switchToOsMode removes the just-stored candidate key if rekey fails', () => {
    const identity = createTestCredentialIdentity();
    const { db, userDataPath, close } = createTestDatabase();
    try {
      db.close(); // force the subsequent PRAGMA rekey call to throw

      expect(() => switchToOsMode(db, userDataPath, identity)).toThrow();

      expect(new Entry(identity.service!, identity.account!).getPassword()).toBeNull();
    } finally {
      clearKeyFromOS(identity);
      close();
    }
  });
});
