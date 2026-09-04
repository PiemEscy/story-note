import type { CreateLabelInput, UpdateLabelInput } from './db/labels';
import type { CreateNoteInput, ListNotesOptions, NoteCounts, UpdateNoteInput } from './db/notes';
import type { LabelRow } from './db/types';
import type { AiStatus, TransformAction } from './ipc/aiHandlers';
import type { ImportResult, PublicNoteRow } from './ipc/notesHandlers';
import type { IpcResult } from './ipc/types';
import type { ShortcutAction } from './shortcuts';
import type { KeyMode } from './db/keys';

export interface StoryNoteAPI {
  notes: {
    create: (input: CreateNoteInput) => Promise<IpcResult<PublicNoteRow>>;
    get: (id: number) => Promise<IpcResult<PublicNoteRow | undefined>>;
    update: (input: UpdateNoteInput & { id: number }) => Promise<IpcResult<PublicNoteRow>>;
    list: (options?: ListNotesOptions) => Promise<IpcResult<PublicNoteRow[]>>;
    listArchived: () => Promise<IpcResult<PublicNoteRow[]>>;
    listTrashed: () => Promise<IpcResult<PublicNoteRow[]>>;
    getCounts: () => Promise<IpcResult<NoteCounts>>;
    setPinned: (id: number, isPinned: boolean) => Promise<IpcResult<void>>;
    setArchived: (id: number, isArchived: boolean) => Promise<IpcResult<void>>;
    delete: (id: number) => Promise<IpcResult<void>>;
    restore: (id: number) => Promise<IpcResult<void>>;
    purge: (id: number) => Promise<IpcResult<void>>;
    export: (id: number) => Promise<IpcResult<{ cancelled: boolean }>>;
    import: (defaultLabelId: number | null) => Promise<IpcResult<ImportResult>>;
    lock: (id: number, password: string) => Promise<IpcResult<PublicNoteRow>>;
    unlock: (id: number, password: string) => Promise<IpcResult<PublicNoteRow>>;
    removeLock: (id: number, password: string) => Promise<IpcResult<PublicNoteRow>>;
  };
  labels: {
    create: (input: CreateLabelInput) => Promise<IpcResult<LabelRow>>;
    list: () => Promise<IpcResult<LabelRow[]>>;
    update: (input: UpdateLabelInput & { id: number }) => Promise<IpcResult<LabelRow>>;
    delete: (id: number) => Promise<IpcResult<void>>;
    assign: (noteId: number, labelId: number | null) => Promise<IpcResult<PublicNoteRow>>;
  };
  settings: {
    get: (key: string) => Promise<IpcResult<string | undefined>>;
    getAll: () => Promise<IpcResult<Record<string, string>>>;
    set: (key: string, value: string) => Promise<IpcResult<void>>;
    delete: (key: string) => Promise<IpcResult<void>>;
  };
  search: {
    query: (query: string) => Promise<IpcResult<PublicNoteRow[]>>;
  };
  ai: {
    getStatus: () => Promise<IpcResult<AiStatus>>;
    setApiKey: (apiKey: string) => Promise<IpcResult<void>>;
    clearApiKey: () => Promise<IpcResult<void>>;
    chat: (
      messages: { role: 'user' | 'assistant'; content: string }[],
    ) => Promise<IpcResult<{ reply: string }>>;
    transform: (input: {
      selectedText: string;
      action: TransformAction;
      instructions?: string;
    }) => Promise<IpcResult<{ result: string }>>;
  };
  shortcuts: {
    onTrigger: (callback: (action: ShortcutAction) => void) => () => void;
  };
  app: {
    isLocked: () => Promise<IpcResult<boolean>>;
    unlock: (password: string) => Promise<IpcResult<void>>;
  };
  keyMode: {
    get: () => Promise<IpcResult<KeyMode>>;
    setPassword: (password: string) => Promise<IpcResult<void>>;
    setOs: () => Promise<IpcResult<void>>;
  };
  window: {
    setAlwaysOnTop: (value: boolean) => Promise<IpcResult<void>>;
    setLaunchOnStartup: (value: boolean) => Promise<IpcResult<void>>;
  };
}

declare global {
  interface Window {
    storyNoteAPI: StoryNoteAPI;
  }
}
