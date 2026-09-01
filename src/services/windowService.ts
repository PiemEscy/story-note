import type { IpcResult } from '../../electron/ipc/types';

// Unwraps the { ok, data } / { ok: false, message } envelope every IPC call
// returns, throwing on failure — mirrors notesService.ts's unwrap().
function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.data;
}

export const windowService = {
  setAlwaysOnTop: (value: boolean) => window.storyNoteAPI.window.setAlwaysOnTop(value).then(unwrap),
  setLaunchOnStartup: (value: boolean) =>
    window.storyNoteAPI.window.setLaunchOnStartup(value).then(unwrap),
};
