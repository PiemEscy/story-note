// Channel names: storynote:<domain>:<action> (code-style.md, architecture.md).
// Single source of truth, imported by both the main-process handlers and
// preload — never hand-typed as a string literal at either call site.
export const IPC_CHANNELS = {
  notes: {
    create: 'storynote:notes:create',
    get: 'storynote:notes:get',
    update: 'storynote:notes:update',
    list: 'storynote:notes:list',
    listArchived: 'storynote:notes:list-archived',
    listTrashed: 'storynote:notes:list-trashed',
    getCounts: 'storynote:notes:get-counts',
    setPinned: 'storynote:notes:set-pinned',
    setArchived: 'storynote:notes:set-archived',
    delete: 'storynote:notes:delete',
    restore: 'storynote:notes:restore',
    purge: 'storynote:notes:purge',
    export: 'storynote:notes:export',
    lock: 'storynote:notes:lock',
    unlock: 'storynote:notes:unlock',
    removeLock: 'storynote:notes:remove-lock',
  },
  labels: {
    create: 'storynote:labels:create',
    list: 'storynote:labels:list',
    update: 'storynote:labels:update',
    delete: 'storynote:labels:delete',
    assign: 'storynote:labels:assign',
  },
  settings: {
    get: 'storynote:settings:get',
    getAll: 'storynote:settings:get-all',
    set: 'storynote:settings:set',
    delete: 'storynote:settings:delete',
  },
  search: {
    query: 'storynote:search:query',
  },
  // Main -> renderer push (not a request/response invoke like every channel
  // above) — electron/shortcuts.ts sends on this when a global shortcut
  // fires; preload.ts exposes it as shortcuts.onTrigger(), never raw
  // ipcRenderer.on access.
  shortcuts: {
    trigger: 'storynote:shortcuts:trigger',
  },
} as const;
