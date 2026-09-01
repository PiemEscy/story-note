import { ipcMain } from 'electron';
import type Database from 'better-sqlite3-multiple-ciphers';
import { readKeyMetadata, switchToOsMode, switchToPasswordMode } from '../db/keys';
import type { CredentialIdentity, KeyMode } from '../db/keys';
import { IPC_CHANNELS } from './channels';
import { toIpcResult } from './types';
import type { IpcResult } from './types';
import { requireString } from './validation';

// Only meaningful once `db` is open (ADR-001's key handling is independent
// of note content, but switchToPasswordMode/switchToOsMode both re-key an
// already-open connection in place — see electron/db/keys.ts) — registered
// alongside the notes/labels/etc. handlers, not with appHandlers.ts's
// always-available isLocked/unlock.
export function handleGetKeyMode(userDataPath: string): IpcResult<KeyMode> {
  return toIpcResult(() => readKeyMetadata(userDataPath).keyMode);
}

// Switching TO password mode from the Settings panel — distinct from
// unlocking an already-password-protected database at startup
// (appHandlers.ts): this operates on a database that's already open (the
// app is already running in OS mode), so it doesn't need to re-verify
// anything beyond "a real password was actually typed" — matches
// notesHandlers.ts's handleLock rejecting an empty password the same way.
//
// `identity` is optional and only ever passed by tests (electron/db/
// keys.ts's own tests use the identical pattern) — switchToPasswordMode/
// switchToOsMode touch the real OS credential store when it's omitted, and
// calling either from a test without overriding it would read/write/delete
// this machine's actual 'storynote'/'sqlcipher-key' Windows Credential
// Manager entry.
export function handleSetPasswordMode(
  db: Database.Database,
  userDataPath: string,
  input: unknown,
  identity?: CredentialIdentity,
): IpcResult<void> {
  return toIpcResult(() => {
    const password = requireString(input, 'password');
    if (password.length === 0) {
      throw new Error('Password cannot be empty');
    }
    switchToPasswordMode(db, userDataPath, password, identity);
  });
}

// Switching back to OS mode never needs the current password: the app is
// already running with the database decrypted, so whoever is at the
// keyboard already has the access this would otherwise be gating.
export function handleSetOsMode(
  db: Database.Database,
  userDataPath: string,
  identity?: CredentialIdentity,
): IpcResult<void> {
  return toIpcResult(() => switchToOsMode(db, userDataPath, identity));
}

export function registerKeyModeHandlers(db: Database.Database, userDataPath: string): void {
  ipcMain.handle(IPC_CHANNELS.keyMode.get, () => handleGetKeyMode(userDataPath));
  ipcMain.handle(IPC_CHANNELS.keyMode.setPassword, (_event, input) =>
    handleSetPasswordMode(db, userDataPath, input),
  );
  ipcMain.handle(IPC_CHANNELS.keyMode.setOs, () => handleSetOsMode(db, userDataPath));
}
