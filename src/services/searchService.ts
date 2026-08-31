import type { PublicNoteRow } from '../../electron/ipc/notesHandlers';
import type { IpcResult } from '../../electron/ipc/types';

export type { PublicNoteRow };

// Unwraps the { ok, data } / { ok: false, message } envelope every IPC call
// returns, throwing on failure — mirrors notesService.ts's unwrap().
function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.data;
}

export const searchService = {
  query: (query: string) => window.storyNoteAPI.search.query(query).then(unwrap),
};
