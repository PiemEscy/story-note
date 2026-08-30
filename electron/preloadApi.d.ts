import type { CreateLabelInput, UpdateLabelInput } from './db/labels';
import type { CreateNoteInput, ListNotesOptions, UpdateNoteInput } from './db/notes';
import type { LabelRow } from './db/types';
import type { PublicNoteRow } from './ipc/notesHandlers';
import type { IpcResult } from './ipc/types';

export interface StoryNoteAPI {
  notes: {
    create: (input: CreateNoteInput) => Promise<IpcResult<PublicNoteRow>>;
    get: (id: number) => Promise<IpcResult<PublicNoteRow | undefined>>;
    update: (input: UpdateNoteInput & { id: number }) => Promise<IpcResult<PublicNoteRow>>;
    list: (options?: ListNotesOptions) => Promise<IpcResult<PublicNoteRow[]>>;
    listArchived: () => Promise<IpcResult<PublicNoteRow[]>>;
    listTrashed: () => Promise<IpcResult<PublicNoteRow[]>>;
    setPinned: (id: number, isPinned: boolean) => Promise<IpcResult<void>>;
    setArchived: (id: number, isArchived: boolean) => Promise<IpcResult<void>>;
    delete: (id: number) => Promise<IpcResult<void>>;
    restore: (id: number) => Promise<IpcResult<void>>;
    purge: (id: number) => Promise<IpcResult<void>>;
    export: (id: number) => Promise<IpcResult<{ cancelled: boolean }>>;
  };
  labels: {
    create: (input: CreateLabelInput) => Promise<IpcResult<LabelRow>>;
    list: () => Promise<IpcResult<LabelRow[]>>;
    update: (input: UpdateLabelInput & { id: number }) => Promise<IpcResult<LabelRow>>;
    delete: (id: number) => Promise<IpcResult<void>>;
    assign: (noteId: number, labelId: number | null) => Promise<IpcResult<void>>;
  };
  settings: {
    get: (key: string) => Promise<IpcResult<string | undefined>>;
    getAll: () => Promise<IpcResult<Record<string, string>>>;
    set: (key: string, value: string) => Promise<IpcResult<void>>;
    delete: (key: string) => Promise<IpcResult<void>>;
  };
}

declare global {
  interface Window {
    storyNoteAPI: StoryNoteAPI;
  }
}
