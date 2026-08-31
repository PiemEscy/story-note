import type { IpcResult } from '../../electron/ipc/types';

// Unwraps the { ok, data } / { ok: false, message } envelope every IPC call
// returns, throwing on failure — mirrors notesService.ts's unwrap().
function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.data;
}

export const settingsService = {
  get: (key: string) => window.storyNoteAPI.settings.get(key).then(unwrap),
  getAll: () => window.storyNoteAPI.settings.getAll().then(unwrap),
  set: (key: string, value: string) => window.storyNoteAPI.settings.set(key, value).then(unwrap),
  delete: (key: string) => window.storyNoteAPI.settings.delete(key).then(unwrap),
};
