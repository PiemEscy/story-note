import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './ipc/channels';

// Named, single-purpose methods only — no raw ipcRenderer passthrough.
// Each maps to exactly one IPC channel (code-style.md).
const storyNoteAPI = {
  notes: {
    create: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.notes.create, input),
    get: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.notes.get, id),
    update: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.notes.update, input),
    list: (options?: unknown) => ipcRenderer.invoke(IPC_CHANNELS.notes.list, options),
    listArchived: () => ipcRenderer.invoke(IPC_CHANNELS.notes.listArchived),
    listTrashed: () => ipcRenderer.invoke(IPC_CHANNELS.notes.listTrashed),
    getCounts: () => ipcRenderer.invoke(IPC_CHANNELS.notes.getCounts),
    setPinned: (id: number, isPinned: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.notes.setPinned, { id, isPinned }),
    setArchived: (id: number, isArchived: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.notes.setArchived, { id, isArchived }),
    delete: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.notes.delete, id),
    restore: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.notes.restore, id),
    purge: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.notes.purge, id),
    export: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.notes.export, id),
  },
  labels: {
    create: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.labels.create, input),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.labels.list),
    update: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.labels.update, input),
    delete: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.labels.delete, id),
    assign: (noteId: number, labelId: number | null) =>
      ipcRenderer.invoke(IPC_CHANNELS.labels.assign, { noteId, labelId }),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.settings.get, key),
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.settings.getAll),
    set: (key: string, value: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.set, { key, value }),
    delete: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.settings.delete, key),
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('storyNoteAPI', storyNoteAPI);
  } catch (error) {
    console.error('[preload] failed to expose storyNoteAPI', error);
  }
} else {
  // contextIsolation is always enabled in this app; this branch is unreachable in practice.
  window.storyNoteAPI = storyNoteAPI;
}
