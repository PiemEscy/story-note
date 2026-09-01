import type { IpcResult } from '../../electron/ipc/types';

// Unwraps the { ok, data } / { ok: false, message } envelope every IPC call
// returns, throwing on failure — mirrors notesService.ts's unwrap().
function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.data;
}

// ADR-001's password mode — appHandlers.ts is registered unconditionally at
// startup, before every other IPC channel might even exist yet (they all
// need the database open, which might not be true until unlock() succeeds).
export const appService = {
  isLocked: () => window.storyNoteAPI.app.isLocked().then(unwrap),
  unlock: (password: string) => window.storyNoteAPI.app.unlock(password).then(unwrap),
};
