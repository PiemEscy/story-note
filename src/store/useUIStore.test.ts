import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from './useUIStore';

interface MockSettingsApi {
  get: ReturnType<typeof vi.fn>;
  getAll: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

// Installs a mocked window.storyNoteAPI.settings — the store's only IPC
// dependency (via services/settingsService.ts) — so these tests exercise
// real store logic without a real IPC transport.
function installMockApi(overrides: Record<string, unknown> = {}): MockSettingsApi {
  const settingsApi = {
    get: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    getAll: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    set: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    delete: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    ...overrides,
  };
  // @ts-expect-error partial mock is sufficient — the store only touches `settings`
  window.storyNoteAPI = { settings: settingsApi };
  return settingsApi;
}

beforeEach(() => {
  useUIStore.setState({
    theme: 'system',
    resolvedTheme: 'light',
    view: 'sidebar',
    isNoteDetailOpen: false,
  });
  installMockApi();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useUIStore', () => {
  it('defaults theme to system', () => {
    expect(useUIStore.getState().theme).toBe('system');
  });

  it('updates theme and resolvedTheme via setTheme, and persists the choice', async () => {
    const api = installMockApi();

    useUIStore.getState().setTheme('dark');

    expect(useUIStore.getState().theme).toBe('dark');
    expect(useUIStore.getState().resolvedTheme).toBe('dark');
    // fire-and-forget persistence — give the microtask queue a turn
    await Promise.resolve();
    expect(api.set).toHaveBeenCalledWith('theme', 'dark');
  });

  it('applies the resolved theme to document.documentElement.dataset.theme', () => {
    useUIStore.getState().setTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');

    useUIStore.getState().setTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('runs in a DOM environment (jsdom)', () => {
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');
  });

  describe('initTheme', () => {
    it('applies a valid persisted theme preference', async () => {
      installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: 'dark' }) });

      await useUIStore.getState().initTheme();

      expect(useUIStore.getState().theme).toBe('dark');
      expect(useUIStore.getState().resolvedTheme).toBe('dark');
    });

    it('falls back to the current default when nothing is persisted', async () => {
      installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: undefined }) });

      await useUIStore.getState().initTheme();

      expect(useUIStore.getState().theme).toBe('system');
    });

    it('falls back to the current default when the persisted value is invalid', async () => {
      installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: 'not-a-theme' }) });

      await useUIStore.getState().initTheme();

      expect(useUIStore.getState().theme).toBe('system');
    });

    it('does not clobber a theme set via setTheme() while the IPC call is still in flight', async () => {
      let resolveGet!: (value: { ok: true; data: string }) => void;
      const pending = new Promise<{ ok: true; data: string }>((resolve) => {
        resolveGet = resolve;
      });
      installMockApi({ get: vi.fn().mockReturnValue(pending) });

      const initPromise = useUIStore.getState().initTheme();
      // The user clicks the toggle while the settings.get() call above is
      // still pending.
      useUIStore.getState().setTheme('dark');

      resolveGet({ ok: true, data: 'light' }); // the (now-stale) persisted value
      await initPromise;

      expect(useUIStore.getState().theme).toBe('dark');
    });

    it('does not throw when the settings IPC call fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      installMockApi({ get: vi.fn().mockResolvedValue({ ok: false, message: 'db is locked' }) });

      await expect(useUIStore.getState().initTheme()).resolves.toBeUndefined();
      expect(useUIStore.getState().theme).toBe('system');
    });
  });

  describe('view mode', () => {
    it('defaults view to sidebar', () => {
      expect(useUIStore.getState().view).toBe('sidebar');
    });

    it('updates view via setView, and persists the choice', async () => {
      const api = installMockApi();

      useUIStore.getState().setView('grid');

      expect(useUIStore.getState().view).toBe('grid');
      await Promise.resolve();
      expect(api.set).toHaveBeenCalledWith('last_view', 'grid');
    });

    describe('initView', () => {
      it('applies a valid persisted view preference', async () => {
        installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: 'details' }) });

        await useUIStore.getState().initView();

        expect(useUIStore.getState().view).toBe('details');
      });

      it('falls back to the current default when the persisted value is invalid', async () => {
        installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: 'not-a-view' }) });

        await useUIStore.getState().initView();

        expect(useUIStore.getState().view).toBe('sidebar');
      });

      it('does not clobber a view set via setView() while the IPC call is still in flight', async () => {
        let resolveGet!: (value: { ok: true; data: string }) => void;
        const pending = new Promise<{ ok: true; data: string }>((resolve) => {
          resolveGet = resolve;
        });
        installMockApi({ get: vi.fn().mockReturnValue(pending) });

        const initPromise = useUIStore.getState().initView();
        useUIStore.getState().setView('largegrid');

        resolveGet({ ok: true, data: 'list' }); // the (now-stale) persisted value
        await initPromise;

        expect(useUIStore.getState().view).toBe('largegrid');
      });
    });
  });

  describe('note detail overlay', () => {
    it('defaults isNoteDetailOpen to false', () => {
      expect(useUIStore.getState().isNoteDetailOpen).toBe(false);
    });

    it('openNoteDetail/closeNoteDetail toggle isNoteDetailOpen', () => {
      useUIStore.getState().openNoteDetail();
      expect(useUIStore.getState().isNoteDetailOpen).toBe(true);

      useUIStore.getState().closeNoteDetail();
      expect(useUIStore.getState().isNoteDetailOpen).toBe(false);
    });

    // Regression coverage: deriving "is a note open full-screen" from
    // useNoteStore's activeNoteId alone (rather than this dedicated flag)
    // meant switching views while a note happened to already be active
    // (e.g. right after creating one) jumped straight into the overlay
    // instead of showing the new view's fresh listing. setView() resetting
    // isNoteDetailOpen is what NoteList.tsx/EditorPanel.tsx rely on to
    // avoid that.
    it('setView resets isNoteDetailOpen to false', () => {
      useUIStore.getState().openNoteDetail();
      expect(useUIStore.getState().isNoteDetailOpen).toBe(true);

      useUIStore.getState().setView('grid');

      expect(useUIStore.getState().isNoteDetailOpen).toBe(false);
    });
  });
});
