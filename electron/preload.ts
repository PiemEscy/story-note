import { contextBridge } from 'electron';

// Named, single-purpose methods only — no raw ipcRenderer passthrough.
// Populated as IPC channels are implemented (storynote:<domain>:<action>).
const storyNoteAPI = {};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('storyNoteAPI', storyNoteAPI);
  } catch (error) {
    console.error('[preload] failed to expose storyNoteAPI', error);
  }
} else {
  // @ts-expect-error contextIsolation is always enabled; this branch is unreachable in practice.
  window.storyNoteAPI = storyNoteAPI;
}
