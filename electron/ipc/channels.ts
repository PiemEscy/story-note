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
  // Registered unconditionally at app startup (electron/ipc/appHandlers.ts),
  // unlike every channel above — those all need `db` open first, which is
  // exactly what might not be true yet when the database is in password
  // mode (ADR-001). isLocked/unlock let the renderer show an unlock screen
  // and drive the rest of startup, instead of every other IPC call just
  // failing with "no handler registered" until someone submits a password.
  app: {
    isLocked: 'storynote:app:is-locked',
    unlock: 'storynote:app:unlock',
  },
  // Only meaningful once `db` is open — registered alongside the notes/
  // labels/etc. handlers in registerIpcHandlers(), not with app.* above.
  keyMode: {
    get: 'storynote:key-mode:get',
    setPassword: 'storynote:key-mode:set-password',
    setOs: 'storynote:key-mode:set-os',
  },
  // Settings that need a *live* main-process effect beyond persistence
  // (settings:set alone would only apply on the next launch) — the Settings
  // panel's Always on Top / launch-at-login toggles go through these instead
  // of the generic settings channel. Channel strings stay under the
  // `settings` domain (code-style.md: "keep domain names aligned with the
  // scopes in git-commit-style.md") even though the grouping key here is
  // `window` for readability at the call sites.
  window: {
    setAlwaysOnTop: 'storynote:settings:set-always-on-top',
    setLaunchOnStartup: 'storynote:settings:set-launch-on-startup',
  },
} as const;
