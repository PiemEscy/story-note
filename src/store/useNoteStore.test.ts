import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNoteStore } from './useNoteStore';
import type { PublicNoteRow } from '../services/notesService';

function note(id: number, overrides: Partial<PublicNoteRow> = {}): PublicNoteRow {
  return {
    id,
    title: `Note ${id}`,
    content: '',
    content_plain: '',
    label_id: null,
    is_pinned: 0,
    is_archived: 0,
    is_locked: 0,
    created_at: '2026-01-01 00:00:00',
    updated_at: '2026-01-01 00:00:00',
    deleted_at: null,
    ...overrides,
  };
}

interface MockNotesApi {
  create: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  listArchived: ReturnType<typeof vi.fn>;
  listTrashed: ReturnType<typeof vi.fn>;
  setPinned: ReturnType<typeof vi.fn>;
  setArchived: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  purge: ReturnType<typeof vi.fn>;
  export: ReturnType<typeof vi.fn>;
}

// Installs a mocked window.storyNoteAPI.notes — the store's only dependency
// (via services/notesService.ts) — so these tests exercise real store logic
// (dropNote semantics, race handling, error propagation) without a real IPC
// transport or database.
function installMockApi(overrides: Record<string, unknown> = {}): MockNotesApi {
  const notesApi = {
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    list: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    listArchived: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    listTrashed: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    setPinned: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    setArchived: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    delete: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    restore: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    purge: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    export: vi.fn(),
    ...overrides,
  };
  // @ts-expect-error partial mock is sufficient — the store only touches `notes`
  window.storyNoteAPI = { notes: notesApi };
  return notesApi;
}

beforeEach(() => {
  useNoteStore.setState({
    notes: [],
    activeNoteId: null,
    filter: 'active',
    isLoading: false,
    error: null,
    _loadRequestId: 0,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('drop-on-success actions (delete/restore/purge/setArchived)', () => {
  it('deleteNote removes the note and clears activeNoteId if it was selected', async () => {
    installMockApi();
    useNoteStore.setState({ notes: [note(1), note(2)], activeNoteId: 1 });

    await useNoteStore.getState().deleteNote(1);

    expect(useNoteStore.getState().notes.map((n) => n.id)).toEqual([2]);
    expect(useNoteStore.getState().activeNoteId).toBeNull();
  });

  it('deleteNote leaves activeNoteId alone if a different note was selected', async () => {
    installMockApi();
    useNoteStore.setState({ notes: [note(1), note(2)], activeNoteId: 2 });

    await useNoteStore.getState().deleteNote(1);

    expect(useNoteStore.getState().activeNoteId).toBe(2);
  });

  it('restoreNote removes the note from the current (trash) list', async () => {
    installMockApi();
    useNoteStore.setState({ notes: [note(1)], activeNoteId: 1, filter: 'trash' });

    await useNoteStore.getState().restoreNote(1);

    expect(useNoteStore.getState().notes).toEqual([]);
    expect(useNoteStore.getState().activeNoteId).toBeNull();
  });

  it('purgeNote removes the note from the current (trash) list', async () => {
    installMockApi();
    useNoteStore.setState({ notes: [note(1)], activeNoteId: 1, filter: 'trash' });

    await useNoteStore.getState().purgeNote(1);

    expect(useNoteStore.getState().notes).toEqual([]);
  });

  it('setArchived removes the note from the currently-viewed list either direction', async () => {
    installMockApi();
    useNoteStore.setState({ notes: [note(1)], activeNoteId: 1, filter: 'active' });

    await useNoteStore.getState().setArchived(1, true);

    expect(useNoteStore.getState().notes).toEqual([]);
    expect(useNoteStore.getState().activeNoteId).toBeNull();
  });

  it('sets error state (and does not throw) when the service call fails', async () => {
    installMockApi({ delete: vi.fn().mockResolvedValue({ ok: false, message: 'db is locked' }) });
    useNoteStore.setState({ notes: [note(1)] });

    await useNoteStore.getState().deleteNote(1);

    expect(useNoteStore.getState().error).toBe('db is locked');
    // the note is untouched since the service call failed
    expect(useNoteStore.getState().notes).toEqual([note(1)]);
  });
});

describe('loadNotes', () => {
  it('populates notes from the service for the current filter', async () => {
    const api = installMockApi({ list: vi.fn().mockResolvedValue({ ok: true, data: [note(1)] }) });
    useNoteStore.setState({ filter: 'active' });

    await useNoteStore.getState().loadNotes();

    expect(api.list).toHaveBeenCalled();
    expect(useNoteStore.getState().notes).toEqual([note(1)]);
    expect(useNoteStore.getState().isLoading).toBe(false);
  });

  it('an older in-flight request does not clobber a newer one that already resolved', async () => {
    let resolveOlder!: (value: { ok: true; data: PublicNoteRow[] }) => void;
    const olderPromise = new Promise<{ ok: true; data: PublicNoteRow[] }>((resolve) => {
      resolveOlder = resolve;
    });
    let callCount = 0;
    const list = vi.fn().mockImplementation(() => {
      callCount += 1;
      return callCount === 1 ? olderPromise : Promise.resolve({ ok: true, data: [note(2)] });
    });
    installMockApi({ list });

    const older = useNoteStore.getState().loadNotes(); // in flight, resolves later
    const newer = useNoteStore.getState().loadNotes(); // resolves immediately
    await newer;

    expect(useNoteStore.getState().notes).toEqual([note(2)]);

    resolveOlder({ ok: true, data: [note(1)] });
    await older;

    // the older, now-stale result must NOT overwrite the newer one
    expect(useNoteStore.getState().notes).toEqual([note(2)]);
  });
});

describe('createNote', () => {
  it('switches to the active filter, reloads, and selects the new note', async () => {
    const created = note(5);
    installMockApi({
      create: vi.fn().mockResolvedValue({ ok: true, data: created }),
      list: vi.fn().mockResolvedValue({ ok: true, data: [created] }),
    });
    useNoteStore.setState({ filter: 'archived' });

    await useNoteStore.getState().createNote();

    expect(useNoteStore.getState().filter).toBe('active');
    expect(useNoteStore.getState().activeNoteId).toBe(5);
    expect(useNoteStore.getState().notes).toEqual([created]);
  });
});

describe('clearError', () => {
  it('resets error to null', () => {
    useNoteStore.setState({ error: 'something went wrong' });
    useNoteStore.getState().clearError();
    expect(useNoteStore.getState().error).toBeNull();
  });
});

describe('updateNote', () => {
  // EditorPanel's autosave (src/components/EditorPanel.tsx) relies on this
  // return value to decide whether it's safe to mark an edit as "saved" —
  // a code review caught a bug where marking it saved unconditionally could
  // permanently lose an edit if the save failed and the user switched notes
  // immediately after, without typing anything further to retry with.
  it('returns true and updates the note in state on success', async () => {
    const updated = note(1, { title: 'Updated title' });
    installMockApi({ update: vi.fn().mockResolvedValue({ ok: true, data: updated }) });
    useNoteStore.setState({ notes: [note(1)] });

    const result = await useNoteStore.getState().updateNote(1, { title: 'Updated title' });

    expect(result).toBe(true);
    expect(useNoteStore.getState().notes).toEqual([updated]);
  });

  it('returns false and sets error state on failure, without touching notes', async () => {
    installMockApi({ update: vi.fn().mockResolvedValue({ ok: false, message: 'disk full' }) });
    useNoteStore.setState({ notes: [note(1)] });

    const result = await useNoteStore.getState().updateNote(1, { title: 'New title' });

    expect(result).toBe(false);
    expect(useNoteStore.getState().error).toBe('disk full');
    expect(useNoteStore.getState().notes).toEqual([note(1)]);
  });
});
