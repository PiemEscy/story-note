import { ipcMain } from 'electron';
import { IPC_CHANNELS } from './channels';
import { toIpcResult } from './types';
import type { IpcResult } from './types';
import { requireString } from './validation';

// Registered unconditionally at app startup, before `db` necessarily exists
// — see channels.ts's comment on why this group is separate from every
// other handler file (all of which assume an already-open database).
export interface AppUnlockDeps {
  isLocked: () => boolean;
  // Throws on an incorrect password (-> { ok: false, message } via
  // toIpcResult, same as every other validation failure in this app) or on
  // success, opens the database and finishes the rest of startup — see
  // electron/main.ts's tryUnlock/completeStartup.
  unlock: (password: string) => void;
}

export function handleIsLocked(deps: AppUnlockDeps): IpcResult<boolean> {
  return toIpcResult(() => deps.isLocked());
}

export function handleUnlock(deps: AppUnlockDeps, input: unknown): IpcResult<void> {
  return toIpcResult(() => deps.unlock(requireString(input, 'password')));
}

export function registerAppHandlers(deps: AppUnlockDeps): void {
  ipcMain.handle(IPC_CHANNELS.app.isLocked, () => handleIsLocked(deps));
  ipcMain.handle(IPC_CHANNELS.app.unlock, (_event, input) => handleUnlock(deps, input));
}
