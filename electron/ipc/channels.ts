// Channel names: storynote:<domain>:<action> (code-style.md, architecture.md).
// Single source of truth, imported by both the main-process handlers and
// preload — never hand-typed as a string literal at either call site.
//
// storynote:search:* is intentionally not defined here yet — the query
// logic it would call (LIKE-based search against title/content_plain,
// excluding trashed notes and locked-note content from previews) is
// explicitly Phase 7's own checklist item in development-plan.md, not
// Phase 2's. Adding the channel now would mean wiring it to a handler with
// no real logic behind it — a half-finished implementation. Phase 7 should
// add its channel constant here alongside these when it lands.
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
} as const;
