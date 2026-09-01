import type { KeyMode } from '../../electron/db/keys';
import type { IpcResult } from '../../electron/ipc/types';

export type { KeyMode };

// Unwraps the { ok, data } / { ok: false, message } envelope every IPC call
// returns, throwing on failure — mirrors notesService.ts's unwrap().
function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.data;
}

export const keyModeService = {
  get: () => window.storyNoteAPI.keyMode.get().then(unwrap),
  setPassword: (password: string) => window.storyNoteAPI.keyMode.setPassword(password).then(unwrap),
  setOs: () => window.storyNoteAPI.keyMode.setOs().then(unwrap),
};
