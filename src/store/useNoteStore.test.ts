import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNoteStore } from './useNoteStore';
import { useToastStore } from './useToastStore';
import type { PublicNoteRow } from '../services/notesService';
import type { StoryNoteAPI } from '../../electron/preloadApi';

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
  getCounts: ReturnType<typeof vi.fn>;
  setPinned: ReturnType<typeof vi.fn>;
  setArchived: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  purge: ReturnType<typeof vi.fn>;
  export: ReturnType<typeof vi.fn>;
  import: ReturnType<typeof vi.fn>;
  lock: ReturnType<typeof vi.fn>;
  unlock: ReturnType<typeof vi.fn>;
  removeLock: ReturnType<typeof vi.fn>;
}

// Installs a mocked window.storyNoteAPI.notes (+ .labels.assign,
// .search.query, and .settings.get/set, used only by assignLabel/search/
// setSort+initSort respectively) — the store's only dependencies (via
// services/notesService.ts, services/labelsService.ts, services/
// searchService.ts, and services/settingsService.ts) — so these tests
// exercise real store logic (dropNote semantics, race handling, error
// propagation) without a real IPC transport or database.
function installMockApi(
  overrides: Record<string, unknown> = {},
  labelsOverrides: Record<string, unknown> = {},
  searchOverrides: Record<string, unknown> = {},
  settingsOverrides: Record<string, unknown> = {},
): MockNotesApi {
  const notesApi = {
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    list: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    listArchived: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    listTrashed: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    getCounts: vi
      .fn()
      .mockResolvedValue({ ok: true, data: { active: 0, archived: 0, trash: 0, byLabel: {} } }),
    setPinned: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    setArchived: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    delete: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    restore: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    purge: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    export: vi.fn(),
    import: vi.fn(),
    lock: vi.fn(),
    unlock: vi.fn(),
    removeLock: vi.fn(),
    ...overrides,
  };
  const labelsApi = {
    assign: vi.fn(),
    ...labelsOverrides,
  };
  const searchApi = {
    query: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    ...searchOverrides,
  };
  const settingsApi = {
    get: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    set: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    delete: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    ...settingsOverrides,
  };
  // Partial mock is sufficient — the store only touches notes/labels.assign/
  // search.query/settings.get+set+delete. `as unknown as StoryNoteAPI` rather than
  // `@ts-expect-error`: that directive only suppresses an error reported on
  // the exact next line, and Prettier reformatting this object literal
  // across multiple lines moves the real errors onto the individual
  // property lines instead, silently leaving them unsuppressed.
  window.storyNoteAPI = {
    notes: notesApi,
    labels: labelsApi,
    search: searchApi,
    settings: settingsApi,
  } as unknown as StoryNoteAPI;
  return notesApi;
}

beforeEach(() => {
  useNoteStore.setState({
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
  });
  useToastStore.setState({ toasts: [] });
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

  it('deleteNote also refreshes noteCounts (a note leaving the active list changes its count)', async () => {
    const api = installMockApi({
      getCounts: vi
        .fn()
        .mockResolvedValue({ ok: true, data: { active: 0, archived: 0, trash: 1, byLabel: {} } }),
    });
    useNoteStore.setState({ notes: [note(1)] });

    await useNoteStore.getState().deleteNote(1);
    await Promise.resolve(); // loadNoteCounts is fire-and-forget

    expect(api.getCounts).toHaveBeenCalled();
    expect(useNoteStore.getState().noteCounts).toEqual({
      active: 0,
      archived: 0,
      trash: 1,
      byLabel: {},
    });
  });
});

describe('loadNoteCounts', () => {
  it('populates noteCounts from the service', async () => {
    installMockApi({
      getCounts: vi.fn().mockResolvedValue({
        ok: true,
        data: { active: 3, archived: 1, trash: 0, byLabel: { 1: 2 } },
      }),
    });

    await useNoteStore.getState().loadNoteCounts();

    expect(useNoteStore.getState().noteCounts).toEqual({
      active: 3,
      archived: 1,
      trash: 0,
      byLabel: { 1: 2 },
    });
  });

  it('logs and leaves noteCounts unchanged (no error toast) when the service call fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    installMockApi({
      getCounts: vi.fn().mockResolvedValue({ ok: false, message: 'db is locked' }),
    });
    useNoteStore.setState({ noteCounts: { active: 1, archived: 0, trash: 0, byLabel: {} } });

    await useNoteStore.getState().loadNoteCounts();

    expect(useNoteStore.getState().noteCounts).toEqual({
      active: 1,
      archived: 0,
      trash: 0,
      byLabel: {},
    });
    expect(useNoteStore.getState().error).toBeNull();
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

  it('clears an active labelFilter (a new note is not scoped to whatever label was being browsed)', async () => {
    installMockApi({
      create: vi.fn().mockResolvedValue({ ok: true, data: note(5) }),
      list: vi.fn().mockResolvedValue({ ok: true, data: [note(5)] }),
    });
    useNoteStore.setState({ labelFilter: 3 });

    await useNoteStore.getState().createNote();

    expect(useNoteStore.getState().labelFilter).toBeNull();
  });

  it('clears an active search (a new note should not stay hidden behind stale search results)', async () => {
    installMockApi({
      create: vi.fn().mockResolvedValue({ ok: true, data: note(5) }),
      list: vi.fn().mockResolvedValue({ ok: true, data: [note(5)] }),
    });
    useNoteStore.setState({ searchQuery: 'roadmap', searchResults: [note(9)] });

    await useNoteStore.getState().createNote();

    expect(useNoteStore.getState().searchQuery).toBe('');
    expect(useNoteStore.getState().searchResults).toEqual([]);
  });
});

describe('importNotes', () => {
  it('switches to the active filter, reloads, selects the last imported note, and toasts success', async () => {
    const first = note(5, { title: 'a' });
    const second = note(6, { title: 'b' });
    installMockApi({
      import: vi.fn().mockResolvedValue({
        ok: true,
        data: { cancelled: false, imported: [first, second], failed: [] },
      }),
      list: vi.fn().mockResolvedValue({ ok: true, data: [first, second] }),
    });
    useNoteStore.setState({ filter: 'archived' });

    await useNoteStore.getState().importNotes();

    expect(useNoteStore.getState().filter).toBe('active');
    expect(useNoteStore.getState().activeNoteId).toBe(6);
    expect(useNoteStore.getState().notes).toEqual([first, second]);
    expect(useToastStore.getState().toasts).toEqual([
      { id: expect.any(Number), message: 'Imported 2 notes', variant: 'success' },
    ]);
  });

  it('does nothing when the user cancels the dialog', async () => {
    installMockApi({
      import: vi
        .fn()
        .mockResolvedValue({ ok: true, data: { cancelled: true, imported: [], failed: [] } }),
    });
    useNoteStore.setState({ filter: 'archived', activeNoteId: 42 });

    await useNoteStore.getState().importNotes();

    expect(useNoteStore.getState().filter).toBe('archived');
    expect(useNoteStore.getState().activeNoteId).toBe(42);
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('toasts an error listing the failed file names without blocking successful imports', async () => {
    const created = note(7);
    installMockApi({
      import: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          cancelled: false,
          imported: [created],
          failed: [{ fileName: 'bad.txt', message: 'ENOENT' }],
        },
      }),
      list: vi.fn().mockResolvedValue({ ok: true, data: [created] }),
    });

    await useNoteStore.getState().importNotes();

    expect(useNoteStore.getState().activeNoteId).toBe(7);
    expect(useToastStore.getState().toasts).toEqual([
      { id: expect.any(Number), message: 'Imported 1 note', variant: 'success' },
      { id: expect.any(Number), message: 'Failed to import 1 file: bad.txt', variant: 'error' },
    ]);
  });

  it('toasts an error and creates nothing when every file fails', async () => {
    installMockApi({
      import: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          cancelled: false,
          imported: [],
          failed: [{ fileName: 'bad.txt', message: 'ENOENT' }],
        },
      }),
    });
    useNoteStore.setState({ filter: 'archived' });

    await useNoteStore.getState().importNotes();

    // No successful imports — filter/activeNoteId are left untouched, only
    // the failure toast fires.
    expect(useNoteStore.getState().filter).toBe('archived');
    expect(useToastStore.getState().toasts).toEqual([
      { id: expect.any(Number), message: 'Failed to import 1 file: bad.txt', variant: 'error' },
    ]);
  });

  it('surfaces an IPC-level failure via the shared error state', async () => {
    installMockApi({
      import: vi.fn().mockRejectedValue(new Error('IPC unavailable')),
    });

    await useNoteStore.getState().importNotes();

    expect(useNoteStore.getState().error).toBe('IPC unavailable');
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});

describe('setLabelFilter', () => {
  it('sets filter to active, sets labelFilter, and reloads notes', async () => {
    const api = installMockApi({ list: vi.fn().mockResolvedValue({ ok: true, data: [note(1)] }) });
    useNoteStore.setState({ filter: 'archived', activeNoteId: 7 });

    await useNoteStore.getState().setLabelFilter(3);

    expect(useNoteStore.getState().filter).toBe('active');
    expect(useNoteStore.getState().labelFilter).toBe(3);
    expect(useNoteStore.getState().activeNoteId).toBeNull();
    expect(api.list).toHaveBeenCalled();
    expect(useNoteStore.getState().notes).toEqual([note(1)]);
  });

  it('clears an active search — clicking a label is nav, same precedence as setFilter', async () => {
    installMockApi();
    useNoteStore.setState({ searchQuery: 'roadmap', searchResults: [note(9)] });

    await useNoteStore.getState().setLabelFilter(3);

    expect(useNoteStore.getState().searchQuery).toBe('');
    expect(useNoteStore.getState().searchResults).toEqual([]);
  });
});

describe('setFilter', () => {
  // Sidebar nav (All Notes/Archived/Trash) and a selected label are
  // mutually exclusive, single-selection nav targets — clicking one clears
  // the other, same as clicking a different label clears the previous one
  // via setLabelFilter's own unconditional set().
  it('clears an active labelFilter', async () => {
    installMockApi();
    useNoteStore.setState({ labelFilter: 3 });

    await useNoteStore.getState().setFilter('archived');

    expect(useNoteStore.getState().labelFilter).toBeNull();
  });

  it('clears an active search', async () => {
    installMockApi();
    useNoteStore.setState({ searchQuery: 'roadmap', searchResults: [note(9)] });

    await useNoteStore.getState().setFilter('archived');

    expect(useNoteStore.getState().searchQuery).toBe('');
    expect(useNoteStore.getState().searchResults).toEqual([]);
  });
});

describe('search', () => {
  it('queries the search service and stores the results', async () => {
    const results = [note(1), note(2)];
    installMockApi({}, {}, { query: vi.fn().mockResolvedValue({ ok: true, data: results }) });

    await useNoteStore.getState().search('roadmap');

    expect(useNoteStore.getState().searchQuery).toBe('roadmap');
    expect(useNoteStore.getState().searchResults).toEqual(results);
  });

  it('clears results for a blank query without calling the search service', async () => {
    const query = vi.fn().mockResolvedValue({ ok: true, data: [note(1)] });
    installMockApi({}, {}, { query });
    useNoteStore.setState({ searchResults: [note(9)] });

    await useNoteStore.getState().search('   ');

    expect(useNoteStore.getState().searchResults).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('an older in-flight search does not clobber a newer one that already resolved', async () => {
    let resolveFirst!: (value: { ok: true; data: PublicNoteRow[] }) => void;
    const query = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ ok: true, data: [note(2)] });
    installMockApi({}, {}, { query });

    const first = useNoteStore.getState().search('a');
    await useNoteStore.getState().search('ab');
    resolveFirst({ ok: true, data: [note(1)] });
    await first;

    expect(useNoteStore.getState().searchResults).toEqual([note(2)]);
  });

  it('sets error state (and does not throw) when the service call fails', async () => {
    installMockApi(
      {},
      {},
      { query: vi.fn().mockRejectedValue(new Error('search backend exploded')) },
    );

    await useNoteStore.getState().search('roadmap');

    expect(useNoteStore.getState().error).toBe('search backend exploded');
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

describe('assignLabel', () => {
  // A code review flagged that patching only label_id locally (rather than
  // using the full row the IPC call returns) left updated_at stale in the
  // renderer's cache — assignLabelToNote bumps it in the DB (schema.md: a
  // label change is one of the edits that bumps updated_at), so the note's
  // position in an updated_at-sorted list and its "Modified …" display
  // wouldn't reflect the change until the next full reload.
  it('returns true and replaces the note in state with the full updated row', async () => {
    const updated = note(1, { label_id: 5, updated_at: '2026-02-02 00:00:00' });
    installMockApi({}, { assign: vi.fn().mockResolvedValue({ ok: true, data: updated }) });
    useNoteStore.setState({ notes: [note(1)] });

    const result = await useNoteStore.getState().assignLabel(1, 5);

    expect(result).toBe(true);
    expect(useNoteStore.getState().notes).toEqual([updated]);
  });

  it('returns false and sets error state on failure, without touching notes', async () => {
    installMockApi(
      {},
      { assign: vi.fn().mockResolvedValue({ ok: false, message: 'db is locked' }) },
    );
    useNoteStore.setState({ notes: [note(1)] });

    const result = await useNoteStore.getState().assignLabel(1, 5);

    expect(result).toBe(false);
    expect(useNoteStore.getState().error).toBe('db is locked');
    expect(useNoteStore.getState().notes).toEqual([note(1)]);
  });
});

describe('lockNote', () => {
  it('replaces the note with the (revealed) locked row and marks it unlocked for this session', async () => {
    const locked = note(1, { is_locked: 1, content_plain: 'secret' });
    installMockApi({ lock: vi.fn().mockResolvedValue({ ok: true, data: locked }) });
    useNoteStore.setState({ notes: [note(1)] });

    const result = await useNoteStore.getState().lockNote(1, 'hunter2');

    expect(result).toBe(true);
    expect(useNoteStore.getState().notes).toEqual([locked]);
    expect(useNoteStore.getState().unlockedNoteIds.has(1)).toBe(true);
  });

  it('returns false and sets error state on failure, without touching notes', async () => {
    installMockApi({ lock: vi.fn().mockResolvedValue({ ok: false, message: 'db is locked' }) });
    useNoteStore.setState({ notes: [note(1)] });

    const result = await useNoteStore.getState().lockNote(1, 'hunter2');

    expect(result).toBe(false);
    expect(useNoteStore.getState().error).toBe('db is locked');
    expect(useNoteStore.getState().notes).toEqual([note(1)]);
    expect(useNoteStore.getState().unlockedNoteIds.has(1)).toBe(false);
  });
});

describe('unlockNote', () => {
  it('replaces the note with the revealed row and marks it unlocked for this session', async () => {
    const revealed = note(1, { is_locked: 1, content_plain: 'the real secret' });
    installMockApi({ unlock: vi.fn().mockResolvedValue({ ok: true, data: revealed }) });
    useNoteStore.setState({ notes: [note(1, { is_locked: 1 })] });

    const result = await useNoteStore.getState().unlockNote(1, 'hunter2');

    expect(result).toBe(true);
    expect(useNoteStore.getState().notes).toEqual([revealed]);
    expect(useNoteStore.getState().unlockedNoteIds.has(1)).toBe(true);
  });

  it('an incorrect password returns false, sets error, and leaves the note redacted', async () => {
    installMockApi({
      unlock: vi.fn().mockResolvedValue({ ok: false, message: 'Incorrect password' }),
    });
    const stillLocked = note(1, { is_locked: 1 });
    useNoteStore.setState({ notes: [stillLocked] });

    const result = await useNoteStore.getState().unlockNote(1, 'wrong-password');

    expect(result).toBe(false);
    expect(useNoteStore.getState().error).toBe('Incorrect password');
    expect(useNoteStore.getState().notes).toEqual([stillLocked]);
    expect(useNoteStore.getState().unlockedNoteIds.has(1)).toBe(false);
  });
});

describe('removeNoteLock', () => {
  it('replaces the note with the now-unlocked row on success', async () => {
    const unlocked = note(1, { is_locked: 0 });
    installMockApi({ removeLock: vi.fn().mockResolvedValue({ ok: true, data: unlocked }) });
    useNoteStore.setState({ notes: [note(1, { is_locked: 1 })] });

    const result = await useNoteStore.getState().removeNoteLock(1, 'hunter2');

    expect(result).toBe(true);
    expect(useNoteStore.getState().notes).toEqual([unlocked]);
  });

  it('returns false and sets error state on an incorrect password', async () => {
    installMockApi({
      removeLock: vi.fn().mockResolvedValue({ ok: false, message: 'Incorrect password' }),
    });
    const stillLocked = note(1, { is_locked: 1 });
    useNoteStore.setState({ notes: [stillLocked] });

    const result = await useNoteStore.getState().removeNoteLock(1, 'wrong-password');

    expect(result).toBe(false);
    expect(useNoteStore.getState().error).toBe('Incorrect password');
    expect(useNoteStore.getState().notes).toEqual([stillLocked]);
  });
});

describe('lockAllNotes', () => {
  it('clears unlockedNoteIds and reloads notes so previously-unlocked content is re-redacted', async () => {
    const stillRedacted = note(1, { is_locked: 1, content_plain: '' });
    const api = installMockApi({
      list: vi.fn().mockResolvedValue({ ok: true, data: [stillRedacted] }),
    });
    useNoteStore.setState({
      unlockedNoteIds: new Set([1, 2]),
      notes: [note(1, { is_locked: 1, content_plain: 'was visible' })],
    });

    await useNoteStore.getState().lockAllNotes();

    expect(useNoteStore.getState().unlockedNoteIds.size).toBe(0);
    expect(api.list).toHaveBeenCalled();
    expect(useNoteStore.getState().notes).toEqual([stillRedacted]);
  });
});

describe('togglePin', () => {
  it('calls setPinned and reloads the list (pin changes sort order, not just the note itself)', async () => {
    const pinned = note(1, { is_pinned: 1 });
    const api = installMockApi({
      setPinned: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      list: vi.fn().mockResolvedValue({ ok: true, data: [pinned] }),
    });

    await useNoteStore.getState().togglePin(1, true);

    expect(api.setPinned).toHaveBeenCalledWith(1, true);
    expect(useNoteStore.getState().notes).toEqual([pinned]);
  });

  it('sets error state (and does not throw) when the service call fails', async () => {
    installMockApi({
      setPinned: vi.fn().mockResolvedValue({ ok: false, message: 'db is locked' }),
    });

    await useNoteStore.getState().togglePin(1, true);

    expect(useNoteStore.getState().error).toBe('db is locked');
  });
});

describe('setSort', () => {
  it('updates sortBy/sortDirection, reloads notes, and persists both settings', async () => {
    const api = installMockApi({
      list: vi.fn().mockResolvedValue({ ok: true, data: [note(1)] }),
    });

    await useNoteStore.getState().setSort('title', 'asc');

    expect(useNoteStore.getState().sortBy).toBe('title');
    expect(useNoteStore.getState().sortDirection).toBe('asc');
    expect(useNoteStore.getState().notes).toEqual([note(1)]);
    expect(api.list).toHaveBeenCalledWith({ sortBy: 'title', sortDirection: 'asc' });
    expect(window.storyNoteAPI.settings.set).toHaveBeenCalledWith('sort_by', 'title');
    expect(window.storyNoteAPI.settings.set).toHaveBeenCalledWith('sort_direction', 'asc');
  });
});

describe('initSort', () => {
  it('applies a persisted sort_by/sort_direction and reloads notes', async () => {
    const api = installMockApi(
      { list: vi.fn().mockResolvedValue({ ok: true, data: [note(1)] }) },
      {},
      {},
      {
        get: vi.fn((key: string) =>
          Promise.resolve({
            ok: true,
            data: key === 'sort_by' ? 'title' : key === 'sort_direction' ? 'asc' : undefined,
          }),
        ),
      },
    );

    await useNoteStore.getState().initSort();

    expect(useNoteStore.getState().sortBy).toBe('title');
    expect(useNoteStore.getState().sortDirection).toBe('asc');
    // The persisted sort differs from the default it started with, so it
    // re-triggers its own loadNotes() to actually reflect the new order.
    expect(api.list).toHaveBeenCalledWith({ sortBy: 'title', sortDirection: 'asc' });
    expect(useNoteStore.getState().notes).toEqual([note(1)]);
  });

  it('leaves the default sort untouched when nothing is persisted yet', async () => {
    installMockApi();

    await useNoteStore.getState().initSort();

    expect(useNoteStore.getState().sortBy).toBe('updated_at');
    expect(useNoteStore.getState().sortDirection).toBe('desc');
  });

  it('ignores an invalid persisted value rather than applying garbage', async () => {
    installMockApi(
      {},
      {},
      {},
      {
        get: vi.fn((key: string) =>
          Promise.resolve({ ok: true, data: key === 'sort_by' ? 'not-a-real-field' : undefined }),
        ),
      },
    );

    await useNoteStore.getState().initSort();

    expect(useNoteStore.getState().sortBy).toBe('updated_at');
  });

  it('does not clobber a sort the user already changed while this was still loading', async () => {
    // Both settings.get() calls inside initSort's Promise.all (sort_by and
    // sort_direction) resolve off this single shared pending promise, so one
    // resolveGet() call unblocks both legs at once.
    let resolveGet!: (value: { ok: true; data: string }) => void;
    const pending = new Promise<{ ok: true; data: string }>((resolve) => {
      resolveGet = resolve;
    });
    installMockApi({}, {}, {}, { get: vi.fn(() => pending) });

    const initPromise = useNoteStore.getState().initSort();
    // The user picks a different sort while initSort's settings.get() calls
    // are still in flight.
    useNoteStore.setState({ sortBy: 'label', sortDirection: 'asc' });
    resolveGet({ ok: true, data: 'title' });
    await initPromise;

    expect(useNoteStore.getState().sortBy).toBe('label');
  });
});

describe('selectNote', () => {
  it('sets activeNoteId and persists it as last_note_id', async () => {
    installMockApi();

    useNoteStore.getState().selectNote(5);

    expect(useNoteStore.getState().activeNoteId).toBe(5);
    await Promise.resolve();
    expect(window.storyNoteAPI.settings.set).toHaveBeenCalledWith('last_note_id', '5');
  });

  it('deleting the setting instead of writing an empty string when selecting null', async () => {
    installMockApi();

    useNoteStore.getState().selectNote(null);

    expect(useNoteStore.getState().activeNoteId).toBeNull();
    await Promise.resolve();
    expect(window.storyNoteAPI.settings.delete).toHaveBeenCalledWith('last_note_id');
    expect(window.storyNoteAPI.settings.set).not.toHaveBeenCalled();
  });
});

describe('initLastNote', () => {
  it('selects the persisted note if it exists in the currently-loaded notes', async () => {
    installMockApi({}, {}, {}, { get: vi.fn().mockResolvedValue({ ok: true, data: '2' }) });
    useNoteStore.setState({ notes: [note(1), note(2), note(3)] });

    await useNoteStore.getState().initLastNote();

    expect(useNoteStore.getState().activeNoteId).toBe(2);
  });

  it('leaves activeNoteId untouched if the persisted note no longer exists', async () => {
    installMockApi({}, {}, {}, { get: vi.fn().mockResolvedValue({ ok: true, data: '999' }) });
    useNoteStore.setState({ notes: [note(1)], activeNoteId: null });

    await useNoteStore.getState().initLastNote();

    expect(useNoteStore.getState().activeNoteId).toBeNull();
  });

  it('does nothing when nothing is persisted', async () => {
    installMockApi({}, {}, {}, { get: vi.fn().mockResolvedValue({ ok: true, data: undefined }) });
    useNoteStore.setState({ notes: [note(1)], activeNoteId: null });

    await useNoteStore.getState().initLastNote();

    expect(useNoteStore.getState().activeNoteId).toBeNull();
  });

  it('does not throw when the settings IPC call fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    installMockApi(
      {},
      {},
      {},
      { get: vi.fn().mockResolvedValue({ ok: false, message: 'db is locked' }) },
    );

    await expect(useNoteStore.getState().initLastNote()).resolves.toBeUndefined();
  });
});
