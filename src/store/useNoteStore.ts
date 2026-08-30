import { create } from 'zustand';
import { notesService } from '../services/notesService';
import type { PublicNoteRow } from '../services/notesService';
import type { NoteSortField, SortDirection } from '../../electron/db/notes';

export type NoteFilter = 'active' | 'archived' | 'trash';

interface NoteState {
  notes: PublicNoteRow[];
  activeNoteId: number | null;
  filter: NoteFilter;
  sortBy: NoteSortField;
  sortDirection: SortDirection;
  isLoading: boolean;
  error: string | null;
  // Internal — not meant to be read by components. Bumped on every
  // loadNotes() call so an in-flight request can tell, once it resolves,
  // whether a newer call has since superseded it (see loadNotes below).
  _loadRequestId: number;

  loadNotes: () => Promise<void>;
  setFilter: (filter: NoteFilter) => Promise<void>;
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
  sortBy: 'updated_at',
  sortDirection: 'desc',
  isLoading: false,
  error: null,
  _loadRequestId: 0,

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

  setFilter: async (filter) => {
    set({ filter, activeNoteId: null });
    await get().loadNotes();
  },

  selectNote: (id) => set({ activeNoteId: id }),

  createNote: async () => {
    try {
      const note = await notesService.create({});
      set({ filter: 'active' });
      await get().loadNotes();
      set({ activeNoteId: note.id });
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
    } catch (error) {
      set({ error: messageFrom(error, 'Failed to delete note') });
    }
  },

  restoreNote: async (id) => {
    try {
      await notesService.restore(id);
      set((state) => dropNote(state, id));
    } catch (error) {
      set({ error: messageFrom(error, 'Failed to restore note') });
    }
  },

  purgeNote: async (id) => {
    try {
      await notesService.purge(id);
      set((state) => dropNote(state, id));
    } catch (error) {
      set({ error: messageFrom(error, 'Failed to permanently delete note') });
    }
  },

  setArchived: async (id, isArchived) => {
    try {
      await notesService.setArchived(id, isArchived);
      set((state) => dropNote(state, id));
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

  clearError: () => set({ error: null }),
}));
