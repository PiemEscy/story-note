import type { CreateLabelInput, UpdateLabelInput } from '../../electron/db/labels';
import type { LabelRow } from '../../electron/db/types';
import type { IpcResult } from '../../electron/ipc/types';

export type { LabelRow };

// Unwraps the { ok, data } / { ok: false, message } envelope every IPC call
// returns, throwing on failure — mirrors notesService.ts's unwrap().
function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.data;
}

export const labelsService = {
  create: (input: CreateLabelInput) => window.storyNoteAPI.labels.create(input).then(unwrap),
  list: () => window.storyNoteAPI.labels.list().then(unwrap),
  update: (input: UpdateLabelInput & { id: number }) =>
    window.storyNoteAPI.labels.update(input).then(unwrap),
  delete: (id: number) => window.storyNoteAPI.labels.delete(id).then(unwrap),
  assign: (noteId: number, labelId: number | null) =>
    window.storyNoteAPI.labels.assign(noteId, labelId).then(unwrap),
};
