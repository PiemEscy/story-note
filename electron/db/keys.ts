import { randomBytes } from 'crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { Entry } from '@napi-rs/keyring';
import { hashRawSync } from '@node-rs/argon2';
import type { Algorithm } from '@node-rs/argon2';
import type Database from 'better-sqlite3-multiple-ciphers';
import { getDatabasePath } from './getDatabasePath';
import { getKeyMetadataPath } from './getKeyMetadataPath';

const CREDENTIAL_SERVICE = 'storynote';
const CREDENTIAL_ACCOUNT = 'sqlcipher-key';
const KEY_BYTE_LENGTH = 32; // 256-bit, per ADR-001
// @node-rs/argon2 declares Algorithm as an ambient `const enum`, which
// TypeScript's `isolatedModules` refuses to inline across files — importing
// it as a value trips TS2748. The runtime export is a real object, but
// there's nothing gained by importing it just to read one member off it;
// using the numeric value directly (matching the package's own enum,
// Argon2id = 2) avoids the conflict.
const ARGON2ID: Algorithm = 2;
// Hardcoded rather than left as library defaults: this key derivation
// guards a database against *offline* cracking of a stolen file (ADR-001),
// not a rate-limited online login, so it's tuned harder than typical
// interactive-login guidance — and it must never silently change for an
// existing password-mode database just because a dependency bump changes
// @node-rs/argon2's own defaults. Runs once per launch/mode-switch, not a
// hot path, so the extra cost is free in practice.
const ARGON2_MEMORY_COST_KIB = 65536; // 64 MiB
const ARGON2_TIME_COST = 3;
const ARGON2_PARALLELISM = 1;
const HEX_KEY_PATTERN = /^[0-9a-f]{64}$/i;

export type KeyMode = 'os' | 'password';

export interface KeyMetadata {
  keyMode: KeyMode;
  keyDerivationSalt?: string;
}

export class PasswordRequiredError extends Error {
  constructor() {
    super('A master password is required to unlock this database');
    this.name = 'PasswordRequiredError';
  }
}

// Thrown when OS mode is expected to silently unlock an *existing* database
// but no credential is stored — distinct from true first launch (no db file
// yet), where getKeyFromOS legitimately generates a fresh key. Callers must
// not treat this the same as "create a new key and carry on": the db this
// key was protecting can't be assumed lost, only inaccessible via this path.
export class CredentialMissingError extends Error {
  constructor() {
    super('No encryption key found in OS credential storage for an existing database');
    this.name = 'CredentialMissingError';
  }
}

// Identifies which OS credential-store entry to use. Every OS-touching
// function below defaults to the real app's identity, but accepts an
// override so tests never read/write/delete the same credential entry a
// real installed copy of the app could be using on the same machine.
export interface CredentialIdentity {
  service?: string;
  account?: string;
}

// PRAGMA key/rekey don't support bound parameters, so the value is
// interpolated directly — only ever safe because every caller here passes a
// machine-generated 64-char hex string, never a raw password. This check
// makes that invariant an enforced precondition rather than a convention.
export function assertHexKey(key: string): void {
  if (!HEX_KEY_PATTERN.test(key)) {
    throw new Error('Encryption key must be a 64-character hex string');
  }
}

function getCredentialEntry(identity: CredentialIdentity = {}): Entry {
  return new Entry(identity.service ?? CREDENTIAL_SERVICE, identity.account ?? CREDENTIAL_ACCOUNT);
}

// Default key mode: silent, OS-backed. On a fresh install (no database file
// yet), generates and stores a new key. On an existing install with no
// stored credential, throws CredentialMissingError instead of silently
// generating an unrelated key that would only fail later, confusingly, as a
// "wrong key" database error.
export function getKeyFromOS(userDataPath: string, identity?: CredentialIdentity): string {
  const entry = getCredentialEntry(identity);
  const existing = entry.getPassword();
  if (existing) {
    assertHexKey(existing);
    return existing;
  }

  if (existsSync(getDatabasePath(userDataPath))) {
    throw new CredentialMissingError();
  }

  const generated = randomBytes(KEY_BYTE_LENGTH).toString('hex');
  entry.setPassword(generated);
  return generated;
}

export function storeKeyInOS(key: string, identity?: CredentialIdentity): void {
  assertHexKey(key);
  getCredentialEntry(identity).setPassword(key);
}

export function clearKeyFromOS(identity?: CredentialIdentity): void {
  getCredentialEntry(identity).deletePassword();
}

export function generateSalt(): string {
  return randomBytes(16).toString('hex');
}

// Password mode: derives the SQLCipher key from the master password via
// Argon2id. The salt is not secret (ADR-001) and is stored alongside the db.
export function getKeyFromPassword(password: string, saltHex: string): string {
  const salt = Buffer.from(saltHex, 'hex');
  const derived = hashRawSync(password, {
    algorithm: ARGON2ID,
    memoryCost: ARGON2_MEMORY_COST_KIB,
    timeCost: ARGON2_TIME_COST,
    parallelism: ARGON2_PARALLELISM,
    salt,
    outputLen: KEY_BYTE_LENGTH,
  });
  return derived.toString('hex');
}

export function readKeyMetadata(userDataPath: string): KeyMetadata {
  const path = getKeyMetadataPath(userDataPath);
  if (!existsSync(path)) {
    return { keyMode: 'os' };
  }

  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as KeyMetadata;
  } catch (error) {
    throw new Error(
      `Key metadata file at ${path} is corrupt or unreadable: ${(error as Error).message}`,
    );
  }
}

// Written atomically (temp file + rename) so a crash or lock mid-write can
// never leave storynote.keymeta.json truncated/invalid — readKeyMetadata
// would otherwise fail to parse it and block every future database open.
export function writeKeyMetadata(userDataPath: string, metadata: KeyMetadata): void {
  const path = getKeyMetadataPath(userDataPath);
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, JSON.stringify(metadata), 'utf-8');
  renameSync(tempPath, path);
}

// Resolves the key to open the database with, based on the persisted key
// mode. Throws PasswordRequiredError when password mode is active and no
// password was supplied — the caller (IPC/UI layer) should catch this and
// prompt the user rather than treating it as a hard failure.
export function resolveEncryptionKey(
  userDataPath: string,
  password?: string,
  identity?: CredentialIdentity,
): string {
  const metadata = readKeyMetadata(userDataPath);

  if (metadata.keyMode === 'os') {
    return getKeyFromOS(userDataPath, identity);
  }

  if (!password) {
    throw new PasswordRequiredError();
  }
  if (!metadata.keyDerivationSalt) {
    throw new Error('Password mode is active but no key derivation salt is stored');
  }
  return getKeyFromPassword(password, metadata.keyDerivationSalt);
}

function rekeyDatabase(db: Database.Database, newKey: string): void {
  assertHexKey(newKey);
  db.pragma(`rekey='${newKey}'`);
  // Verify the connection is still healthy under the new key *before* the
  // caller updates/removes the old key's storage location (ADR-001).
  db.prepare('SELECT count(*) FROM sqlite_master').get();
}

// Switches an already-open database from OS mode to password mode.
//
// Ordering is deliberate and was corrected after a security review found
// the original order (rekey, *then* persist) could permanently lose the
// newly-generated salt if persistence failed right after a successful
// rekey — since the salt only ever existed in a local variable up to that
// point, and without it the password-derived key can never be reproduced
// again, even with the correct password. Now:
//
//   1. The new salt is written to metadata *before* the risky rekey call,
//      so it's durable the moment it's generated.
//   2. If rekey then fails, metadata is rolled back to 'os' mode — the
//      salt is discarded, but that's fine, since the switch didn't happen.
//   3. If rekey succeeds, the db is already correctly described by the
//      metadata written in step 1. The only remaining step (clearing the
//      old OS-stored key) is cleanup, not a source of data loss: if it
//      fails, a stale, no-longer-needed OS credential entry is left
//      behind, which is a cosmetic issue, not an unrecoverable one.
export function switchToPasswordMode(
  db: Database.Database,
  userDataPath: string,
  newPassword: string,
  identity?: CredentialIdentity,
): void {
  const salt = generateSalt();
  const key = getKeyFromPassword(newPassword, salt);

  writeKeyMetadata(userDataPath, { keyMode: 'password', keyDerivationSalt: salt });

  try {
    rekeyDatabase(db, key);
  } catch (error) {
    writeKeyMetadata(userDataPath, { keyMode: 'os' });
    throw error;
  }

  clearKeyFromOS(identity);
}

// Switches an already-open database from password mode back to OS mode.
// Mirrors switchToPasswordMode's ordering: the new random key is written to
// OS credential storage *before* the rekey call (the credential store is
// itself the durable location for an OS-mode key, so there's no separate
// metadata field to persist first). If rekey then fails, the just-stored
// candidate key is removed so a later getKeyFromOS() can't return a key
// that doesn't actually open the (still password-mode) database.
export function switchToOsMode(
  db: Database.Database,
  userDataPath: string,
  identity?: CredentialIdentity,
): void {
  const key = randomBytes(KEY_BYTE_LENGTH).toString('hex');
  storeKeyInOS(key, identity);

  try {
    rekeyDatabase(db, key);
  } catch (error) {
    clearKeyFromOS(identity);
    throw error;
  }

  writeKeyMetadata(userDataPath, { keyMode: 'os' });
}
