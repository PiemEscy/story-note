import { create } from 'zustand';
import { notesService } from '../services/notesService';
import type { NoteCounts, PublicNoteRow } from '../services/notesService';
import { labelsService } from '../services/labelsService';
import { searchService } from '../services/searchService';
import type { NoteSortField, SortDirection } from '../../electron/db/notes';

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
  createNote: () => Promise<void>;
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
  exportNote: (id: number) => Promise<{ cancelled: boolean }>;
  assignLabel: (id: number, labelId: number | null) => Promise<boolean>;
  clearError: () => void;
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
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

  selectNote: (id) => set({ activeNoteId: id }),

  createNote: async () => {
    try {
      const note = await notesService.create({});
      set({ filter: 'active', labelFilter: null, searchQuery: '', searchResults: [] });
      await get().loadNotes();
      set({ activeNoteId: note.id });
      void get().loadNoteCounts();
    } catch (error) {
      set({ error: messageFrom(error, 'Failed to create note') });
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

  clearError: () => set({ error: null }),
}));
