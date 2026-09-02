import { create } from 'zustand';
import { notesService } from '../services/notesService';
import type { ImportResult, NoteCounts, PublicNoteRow } from '../services/notesService';
import { labelsService } from '../services/labelsService';
import { searchService } from '../services/searchService';
import { settingsService } from '../services/settingsService';
import { useToastStore } from './useToastStore';
import { useUIStore } from './useUIStore';
import type { NoteSortField, SortDirection } from '../../electron/db/notes';

// Renderer-side copies of electron/db/notes.ts's NOTE_SORT_FIELDS/
// SORT_DIRECTIONS runtime arrays — deliberately not imported as *values*
// from that module: it does `import { hashSync } from '@node-rs/argon2'` at
// the top level (a native Node binding), and any value-level import from
// that file pulls the whole module — argon2 included — into the Vite
// renderer bundle, which then fails to build. `import type` above is erased
// at compile time and stays safe; these two small literal-string lists are
// cheap enough to just mirror rather than needing a shared non-electron
// module to break the two apart.
const NOTE_SORT_FIELDS: NoteSortField[] = ['created_at', 'updated_at', 'title', 'label'];
const SORT_DIRECTIONS: SortDirection[] = ['asc', 'desc'];

function isNoteSortField(value: string | undefined): value is NoteSortField {
  return (NOTE_SORT_FIELDS as readonly string[]).includes(value ?? '');
}

function isSortDirection(value: string | undefined): value is SortDirection {
  return (SORT_DIRECTIONS as readonly string[]).includes(value ?? '');
}

export type NoteFilter = 'active' | 'archived' | 'trash';

interface NoteState {
  notes: PublicNoteRow[];
  activeNoteId: number | null;
  filter: NoteFilter;
  // Non-null when the Sidebar's Labels section has one selected — narrows
  // the 'active' filter's notes down to that label, client-side (notes for
  // 'active' are already fetched in full; no IPC/schema change needed for
  // this). Mutually exclusive with plain filter navigation in practice:
  // setFilter() clears it, matching "same interaction pattern as clicking
  // All Notes" (only one nav-style selection active at a time).
  labelFilter: number | null;
  // Sidebar's nav-item/label-item counts (storynote-ui-reference.html's
  // .nav-count) — null until the first successful load. Independent of
  // `notes` (which only ever holds whichever single filter is currently
  // shown), so it's refreshed separately: once on app mount, then again
  // after any mutation that could change a count (create/delete/restore/
  // purge/archive-toggle/label-assign).
  noteCounts: NoteCounts | null;
  sortBy: NoteSortField;
  sortDirection: SortDirection;
  isLoading: boolean;
  error: string | null;
  // Global search (Sidebar's search input) — spans every filter/label, so it
  // deliberately lives alongside `notes` rather than replacing it: clearing
  // the query just falls back to whatever filter/labelFilter already had
  // selected, with no re-fetch needed.
  searchQuery: string;
  searchResults: PublicNoteRow[];
  // Notes unlocked (password verified) for the current app session — mirrors
  // the main process's own LockSession (electron/db/lockSession.ts), which
  // is the one that actually gates content server-side; this copy exists so
  // the UI can decide what to render (locked panel vs. real editor) without
  // a round trip. Never persisted, never cleared on navigation — only reset
  // by restarting the app, matching "reveal content for that session."
  unlockedNoteIds: Set<number>;
  // Internal — not meant to be read by components. Bumped on every
  // loadNotes() call so an in-flight request can tell, once it resolves,
  // whether a newer call has since superseded it (see loadNotes below).
  _loadRequestId: number;
  // Same guard as _loadRequestId, for search() — a fast keystroke can start
  // a second query before the first's IPC round trip resolves.
  _searchRequestId: number;

  loadNotes: () => Promise<void>;
  loadNoteCounts: () => Promise<void>;
  setFilter: (filter: NoteFilter) => Promise<void>;
  setLabelFilter: (labelId: number) => Promise<void>;
  search: (query: string) => Promise<void>;
  selectNote: (id: number | null) => void;
  // `initial` lets a caller seed title/content/contentPlain directly (e.g.
  // the AI chat modal's "Save as note" — see useAiChatStore.ts) instead of
  // always creating an empty note; labelId still always comes from
  // defaultLabelId, matching plain note creation. Returns the created note
  // (or null on failure) so callers like saveAsNote can act on its id.
  createNote: (initial?: {
    title?: string;
    content?: string;
    contentPlain?: string;
  }) => Promise<PublicNoteRow | null>;
  // Opens the native "choose .txt file(s)" dialog and creates one note per
  // selected file (main process does the dialog/read/create — see
  // electron/ipc/notesHandlers.ts's handleImport). Resolves once the whole
  // batch (including any per-file failures) has been reported via toasts;
  // does nothing if the user cancels the dialog.
  importNotes: () => Promise<void>;
  // Returns whether the save succeeded — EditorPanel's autosave uses this to
  // decide whether it's safe to mark the edit as "saved" (see updateNote's
  // implementation below for why that distinction matters).
  updateNote: (
    id: number,
    input: { title?: string; content?: string; contentPlain?: string },
  ) => Promise<boolean>;
  deleteNote: (id: number) => Promise<void>;
  restoreNote: (id: number) => Promise<void>;
  purgeNote: (id: number) => Promise<void>;
  setArchived: (id: number, isArchived: boolean) => Promise<void>;
  togglePin: (id: number, isPinned: boolean) => Promise<void>;
  exportNote: (id: number) => Promise<{ cancelled: boolean }>;
  assignLabel: (id: number, labelId: number | null) => Promise<boolean>;
  // Persists to settings.sort_by/settings.sort_direction (schema.md) and
  // reloads the active list in the new order — see initSort below for the
  // read side of that persistence.
  setSort: (sortBy: NoteSortField, sortDirection: SortDirection) => Promise<void>;
  initSort: () => Promise<void>;
  lockNote: (id: number, password: string) => Promise<boolean>;
  unlockNote: (id: number, password: string) => Promise<boolean>;
  removeNoteLock: (id: number, password: string) => Promise<boolean>;
  // Phase 10's "quick-lock" global shortcut — a panic button, not a
  // per-note action (see lockNote/unlockNote/removeNoteLock above for
  // those). Mirrors the main process's LockSession.lockAll(): clears every
  // note this session had unlocked, then reloads so the notes array picks
  // up the server's now-redacted content for each of them — clearing
  // unlockedNoteIds alone would hide them from the UI but leave their
  // already-fetched plaintext sitting in this store's memory.
  lockAllNotes: () => Promise<void>;
  // Restores settings.last_note_id (schema.md) as activeNoteId, once the
  // notes it might refer to have actually loaded — App.tsx calls this after
  // loadNotes() resolves, not concurrently with it. Only ever selects a note
  // that's genuinely in the loaded 'active' list; a stale id (the note was
  // since deleted/archived/trashed) is silently ignored rather than erroring
  // — the same fallback that already exists for any not-found note.
  initLastNote: () => Promise<void>;
  clearError: () => void;
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

// Fire-and-forget, like every other settings persistence call in this
// codebase (setTheme, setView, ...) — losing this one write just means the
// next launch doesn't restore this particular note, not a functional break.
function persistLastNoteId(id: number | null): void {
  const write =
    id === null
      ? settingsService.delete('last_note_id')
      : settingsService.set('last_note_id', String(id));
  write.catch((error: unknown) => {
    console.error('[useNoteStore] failed to persist last_note_id setting', error);
  });
}

async function fetchByFilter(
  filter: NoteFilter,
  sortBy: NoteSortField,
  sortDirection: SortDirection,
): Promise<PublicNoteRow[]> {
  switch (filter) {
    case 'archived':
      return notesService.listArchived();
    case 'trash':
      return notesService.listTrashed();
    case 'active':
      return notesService.list({ sortBy, sortDirection });
  }
}

// Archiving, un-archiving, soft-deleting, restoring, and purging all move a
// note out of whichever filtered list is currently showing it — dropping it
// from local state (rather than reloading the whole list) keeps the UI
// responsive without a round trip.
function dropNote(state: NoteState, id: number): Partial<NoteState> {
  return {
    notes: state.notes.filter((note) => note.id !== id),
    activeNoteId: state.activeNoteId === id ? null : state.activeNoteId,
  };
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  activeNoteId: null,
  filter: 'active',
  labelFilter: null,
  noteCounts: null,
  sortBy: 'updated_at',
  sortDirection: 'desc',
  isLoading: false,
  error: null,
  searchQuery: '',
  searchResults: [],
  unlockedNoteIds: new Set(),
  _loadRequestId: 0,
  _searchRequestId: 0,

  loadNotes: async () => {
    const requestId = get()._loadRequestId + 1;
    const { filter, sortBy, sortDirection } = get();
    set({ isLoading: true, error: null, _loadRequestId: requestId });
    try {
      const notes = await fetchByFilter(filter, sortBy, sortDirection);
      // A newer loadNotes() call landed while this one was in flight —
      // discard this (now-stale) result instead of clobbering the list.
      if (get()._loadRequestId !== requestId) return;
      set({ notes, isLoading: false });
    } catch (error) {
      if (get()._loadRequestId !== requestId) return;
      set({ isLoading: false, error: messageFrom(error, 'Failed to load notes') });
    }
  },

  loadNoteCounts: async () => {
    try {
      const noteCounts = await notesService.getCounts();
      set({ noteCounts });
    } catch (error) {
      // Deliberately not surfaced via the `error` toast — a stale/missing
      // sidebar count isn't worth interrupting the user the way a failed
      // note action is; log it for debugging (code-style.md's error
      // handling rule: never swallow silently) and leave the last-known
      // counts (or null) in place.
      console.error('[useNoteStore] failed to load note counts', error);
    }
  },

  setFilter: async (filter) => {
    set({ filter, labelFilter: null, activeNoteId: null, searchQuery: '', searchResults: [] });
    await get().loadNotes();
  },

  setLabelFilter: async (labelId) => {
    set({
      filter: 'active',
      labelFilter: labelId,
      activeNoteId: null,
      searchQuery: '',
      searchResults: [],
    });
    await get().loadNotes();
  },

  search: async (query) => {
    const requestId = get()._searchRequestId + 1;
    set({ searchQuery: query, _searchRequestId: requestId });
    if (query.trim() === '') {
      set({ searchResults: [] });
      return;
    }
    try {
      const results = await searchService.query(query);
      // A newer search() call landed while this one was in flight — discard
      // this (now-stale) result instead of clobbering a fresher one.
      if (get()._searchRequestId !== requestId) return;
      set({ searchResults: results });
    } catch (error) {
      if (get()._searchRequestId !== requestId) return;
      set({ error: messageFrom(error, 'Search failed') });
    }
  },

  selectNote: (id) => {
    set({ activeNoteId: id });
    persistLastNoteId(id);
  },

  createNote: async (initial) => {
    try {
      const note = await notesService.create({
        labelId: useUIStore.getState().defaultLabelId,
        ...initial,
      });
      set({ filter: 'active', labelFilter: null, searchQuery: '', searchResults: [] });
      await get().loadNotes();
      set({ activeNoteId: note.id });
      persistLastNoteId(note.id);
      void get().loadNoteCounts();
      return note;
    } catch (error) {
      set({ error: messageFrom(error, 'Failed to create note') });
      return null;
    }
  },

  importNotes: async () => {
    let result: ImportResult;
    try {
      result = await notesService.import(useUIStore.getState().defaultLabelId);
    } catch (error) {
      set({ error: messageFrom(error, 'Failed to import notes') });
      return;
    }
    if (result.cancelled) return;

    if (result.imported.length > 0) {
      set({ filter: 'active', labelFilter: null, searchQuery: '', searchResults: [] });
      await get().loadNotes();
      const lastImported = result.imported[result.imported.length - 1];
      set({ activeNoteId: lastImported.id });
      persistLastNoteId(lastImported.id);
      void get().loadNoteCounts();
      const noun = result.imported.length === 1 ? 'note' : 'notes';
      useToastStore.getState().pushToast(`Imported ${result.imported.length} ${noun}`, 'success');
    }
    if (result.failed.length > 0) {
      const noun = result.failed.length === 1 ? 'file' : 'files';
      const names = result.failed.map((failure) => failure.fileName).join(', ');
      useToastStore
        .getState()
        .pushToast(`Failed to import ${result.failed.length} ${noun}: ${names}`, 'error');
    }
  },

  updateNote: async (id, input) => {
    try {
      const updated = await notesService.update({ id, ...input });
      set((state) => ({
        notes: state.notes.map((note) => (note.id === id ? updated : note)),
      }));
      return true;
    } catch (error) {
      set({ error: messageFrom(error, 'Failed to save note') });
      return false;
    }
  },

  deleteNote: async (id) => {
    try {
      await notesService.delete(id);
      set((state) => dropNote(state, id));
      void get().loadNoteCounts();
    } catch (error) {
      set({ error: messageFrom(error, 'Failed to delete note') });
    }
  },

  restoreNote: async (id) => {
    try {
      await notesService.restore(id);
      set((state) => dropNote(state, id));
      void get().loadNoteCounts();
    } catch (error) {
      set({ error: messageFrom(error, 'Failed to restore note') });
    }
  },

  purgeNote: async (id) => {
    try {
      await notesService.purge(id);
      set((state) => dropNote(state, id));
      void get().loadNoteCounts();
    } catch (error) {
      set({ error: messageFrom(error, 'Failed to permanently delete note') });
    }
  },

  setArchived: async (id, isArchived) => {
    try {
      await notesService.setArchived(id, isArchived);
      set((state) => dropNote(state, id));
      void get().loadNoteCounts();
    } catch (error) {
      set({ error: messageFrom(error, 'Failed to archive note') });
    }
  },

  // Unlike archive/delete, pinning doesn't remove the note from whatever
  // list is currently showing it — it just changes where that note sorts
  // (listNotes() always fixes pinned notes above unpinned, regardless of
  // sortBy — schema.md/FR-6.1). A full loadNotes() picks up that reordering
  // directly from the server's own ORDER BY rather than re-deriving it
  // client-side.
  togglePin: async (id, isPinned) => {
    try {
      await notesService.setPinned(id, isPinned);
      await get().loadNotes();
    } catch (error) {
      set({ error: messageFrom(error, 'Failed to update pin') });
    }
  },

  exportNote: async (id) => {
    try {
      return await notesService.export(id);
    } catch (error) {
      set({ error: messageFrom(error, 'Failed to export note') });
      return { cancelled: true };
    }
  },

  assignLabel: async (id, labelId) => {
    try {
      const updated = await labelsService.assign(id, labelId);
      set((state) => ({
        notes: state.notes.map((note) => (note.id === id ? updated : note)),
      }));
      void get().loadNoteCounts();
      return true;
    } catch (error) {
      set({ error: messageFrom(error, 'Failed to assign label') });
      return false;
    }
  },

  setSort: async (sortBy, sortDirection) => {
    set({ sortBy, sortDirection });
    await get().loadNotes();
    settingsService.set('sort_by', sortBy).catch((error: unknown) => {
      console.error('[useNoteStore] failed to persist sort_by setting', error);
    });
    settingsService.set('sort_direction', sortDirection).catch((error: unknown) => {
      console.error('[useNoteStore] failed to persist sort_direction setting', error);
    });
  },

  // Mirrors useUIStore's initTheme/initView — same guard against a
  // later-resolving load clobbering a sort the user already picked (e.g. via
  // the sort <select>) while this was still in flight.
  initSort: async () => {
    const before = { sortBy: get().sortBy, sortDirection: get().sortDirection };
    let sortBy = before.sortBy;
    let sortDirection = before.sortDirection;
    try {
      const [storedSortBy, storedSortDirection] = await Promise.all([
        settingsService.get('sort_by'),
        settingsService.get('sort_direction'),
      ]);
      if (isNoteSortField(storedSortBy)) sortBy = storedSortBy;
      if (isSortDirection(storedSortDirection)) sortDirection = storedSortDirection;
    } catch (error) {
      console.error('[useNoteStore] failed to load persisted sort setting', error);
    }
    if (get().sortBy !== before.sortBy || get().sortDirection !== before.sortDirection) return;
    if (sortBy === before.sortBy && sortDirection === before.sortDirection) return;
    set({ sortBy, sortDirection });
    await get().loadNotes();
  },

  lockNote: async (id, password) => {
    try {
      const updated = await notesService.lock(id, password);
      set((state) => ({
        notes: state.notes.map((note) => (note.id === id ? updated : note)),
        unlockedNoteIds: new Set(state.unlockedNoteIds).add(id),
      }));
      return true;
    } catch (error) {
      set({ error: messageFrom(error, 'Failed to lock note') });
      return false;
    }
  },

  unlockNote: async (id, password) => {
    try {
      const updated = await notesService.unlock(id, password);
      set((state) => ({
        notes: state.notes.map((note) => (note.id === id ? updated : note)),
        unlockedNoteIds: new Set(state.unlockedNoteIds).add(id),
      }));
      return true;
    } catch (error) {
      // "Incorrect password" lands here — surfaced via the shared `error`
      // state, same as every other failing action; LockedNotePanel also
      // renders it inline next to the password field (see that component).
      set({ error: messageFrom(error, 'Failed to unlock note') });
      return false;
    }
  },

  removeNoteLock: async (id, password) => {
    try {
      const updated = await notesService.removeLock(id, password);
      set((state) => ({
        notes: state.notes.map((note) => (note.id === id ? updated : note)),
        unlockedNoteIds: new Set(state.unlockedNoteIds).add(id),
      }));
      return true;
    } catch (error) {
      set({ error: messageFrom(error, 'Failed to remove lock') });
      return false;
    }
  },

  lockAllNotes: async () => {
    set({ unlockedNoteIds: new Set() });
    await get().loadNotes();
  },

  initLastNote: async () => {
    try {
      const stored = await settingsService.get('last_note_id');
      if (stored === undefined) return;
      const id = Number(stored);
      if (!Number.isFinite(id)) return;
      if (get().notes.some((note) => note.id === id)) {
        set({ activeNoteId: id });
      }
    } catch (error) {
      console.error('[useNoteStore] failed to load persisted last_note_id setting', error);
    }
  },

  clearError: () => set({ error: null }),
}));
