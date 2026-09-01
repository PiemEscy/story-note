import type {
  CreateNoteInput,
  ListNotesOptions,
  NoteCounts,
  UpdateNoteInput,
} from '../../electron/db/notes';
import type { ImportResult, PublicNoteRow } from '../../electron/ipc/notesHandlers';
import type { IpcResult } from '../../electron/ipc/types';

export type { PublicNoteRow, NoteCounts, ImportResult };

// Unwraps the { ok, data } / { ok: false, message } envelope every IPC call
// returns, throwing on failure — callers (the Zustand store) catch this and
// turn it into UI-facing error state, per code-style.md's error handling
// rule (raw exceptions from here still carry a clean, IPC-layer-produced
// message, never a main-process stack trace).
function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.data;
}

export const notesService = {
  create: (input: CreateNoteInput = {}) => window.storyNoteAPI.notes.create(input).then(unwrap),
  get: (id: number) => window.storyNoteAPI.notes.get(id).then(unwrap),
  update: (input: UpdateNoteInput & { id: number }) =>
    window.storyNoteAPI.notes.update(input).then(unwrap),
  list: (options?: ListNotesOptions) => window.storyNoteAPI.notes.list(options).then(unwrap),
  listArchived: () => window.storyNoteAPI.notes.listArchived().then(unwrap),
  listTrashed: () => window.storyNoteAPI.notes.listTrashed().then(unwrap),
  getCounts: () => window.storyNoteAPI.notes.getCounts().then(unwrap),
  setPinned: (id: number, isPinned: boolean) =>
    window.storyNoteAPI.notes.setPinned(id, isPinned).then(unwrap),
  setArchived: (id: number, isArchived: boolean) =>
    window.storyNoteAPI.notes.setArchived(id, isArchived).then(unwrap),
  delete: (id: number) => window.storyNoteAPI.notes.delete(id).then(unwrap),
  restore: (id: number) => window.storyNoteAPI.notes.restore(id).then(unwrap),
  purge: (id: number) => window.storyNoteAPI.notes.purge(id).then(unwrap),
  export: (id: number) => window.storyNoteAPI.notes.export(id).then(unwrap),
  import: (defaultLabelId: number | null = null) =>
    window.storyNoteAPI.notes.import(defaultLabelId).then(unwrap),
  lock: (id: number, password: string) => window.storyNoteAPI.notes.lock(id, password).then(unwrap),
  unlock: (id: number, password: string) =>
    window.storyNoteAPI.notes.unlock(id, password).then(unwrap),
  removeLock: (id: number, password: string) =>
    window.storyNoteAPI.notes.removeLock(id, password).then(unwrap),
};
