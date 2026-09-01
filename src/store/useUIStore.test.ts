import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from './useUIStore';

interface MockSettingsApi {
  get: ReturnType<typeof vi.fn>;
  getAll: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

interface MockWindowApi {
  setAlwaysOnTop: ReturnType<typeof vi.fn>;
  setLaunchOnStartup: ReturnType<typeof vi.fn>;
}

// Installs a mocked window.storyNoteAPI.settings/.window — the store's only
// IPC dependencies (via services/settingsService.ts and
// services/windowService.ts) — so these tests exercise real store logic
// without a real IPC transport.
function installMockApi(
  overrides: Record<string, unknown> = {},
  windowOverrides: Record<string, unknown> = {},
): MockSettingsApi {
  const settingsApi = {
    get: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    getAll: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    set: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    delete: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    ...overrides,
  };
  const windowApi: MockWindowApi = {
    setAlwaysOnTop: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    setLaunchOnStartup: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    ...windowOverrides,
  };
  // @ts-expect-error partial mock is sufficient — the store only touches `settings`/`window`
  window.storyNoteAPI = { settings: settingsApi, window: windowApi };
  return settingsApi;
}

beforeEach(() => {
  useUIStore.setState({
    theme: 'system',
    resolvedTheme: 'light',
    view: 'sidebar',
    isNoteDetailOpen: false,
    compactMode: false,
    sidebarWidth: 240,
    sidebarCollapsed: false,
    alwaysOnTop: false,
    launchOnStartup: false,
    startMinimized: false,
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

  describe('compact mode', () => {
    it('defaults compactMode to false', () => {
      expect(useUIStore.getState().compactMode).toBe(false);
    });

    it('updates compactMode via setCompactMode, and persists the choice', async () => {
      const api = installMockApi();

      useUIStore.getState().setCompactMode(true);

      expect(useUIStore.getState().compactMode).toBe(true);
      await Promise.resolve();
      expect(api.set).toHaveBeenCalledWith('compact_mode', 'true');
    });

    describe('initCompactMode', () => {
      it('applies a persisted "true" value', async () => {
        installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: 'true' }) });

        await useUIStore.getState().initCompactMode();

        expect(useUIStore.getState().compactMode).toBe(true);
      });

      it('falls back to the current default when nothing is persisted', async () => {
        installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: undefined }) });

        await useUIStore.getState().initCompactMode();

        expect(useUIStore.getState().compactMode).toBe(false);
      });

      it('does not clobber a value set via setCompactMode() while the IPC call is still in flight', async () => {
        let resolveGet!: (value: { ok: true; data: string }) => void;
        const pending = new Promise<{ ok: true; data: string }>((resolve) => {
          resolveGet = resolve;
        });
        installMockApi({ get: vi.fn().mockReturnValue(pending) });

        const initPromise = useUIStore.getState().initCompactMode();
        useUIStore.getState().setCompactMode(true);

        resolveGet({ ok: true, data: 'false' }); // the (now-stale) persisted value
        await initPromise;

        expect(useUIStore.getState().compactMode).toBe(true);
      });
    });
  });

  describe('sidebar width', () => {
    it('defaults sidebarWidth to 240', () => {
      expect(useUIStore.getState().sidebarWidth).toBe(240);
    });

    it('updates sidebarWidth via setSidebarWidth, and persists the choice', async () => {
      const api = installMockApi();

      useUIStore.getState().setSidebarWidth(300);

      expect(useUIStore.getState().sidebarWidth).toBe(300);
      await Promise.resolve();
      expect(api.set).toHaveBeenCalledWith('sidebar_width', '300');
    });

    it('clamps setSidebarWidth to [180, 480]', () => {
      installMockApi();

      useUIStore.getState().setSidebarWidth(50);
      expect(useUIStore.getState().sidebarWidth).toBe(180);

      useUIStore.getState().setSidebarWidth(900);
      expect(useUIStore.getState().sidebarWidth).toBe(480);
    });

    describe('initSidebarWidth', () => {
      it('applies a valid persisted width', async () => {
        installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: '320' }) });

        await useUIStore.getState().initSidebarWidth();

        expect(useUIStore.getState().sidebarWidth).toBe(320);
      });

      it('clamps a persisted width outside [180, 480]', async () => {
        installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: '50' }) });

        await useUIStore.getState().initSidebarWidth();

        expect(useUIStore.getState().sidebarWidth).toBe(180);
      });

      it('falls back to the current default for a non-numeric persisted value', async () => {
        installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: 'not-a-number' }) });

        await useUIStore.getState().initSidebarWidth();

        expect(useUIStore.getState().sidebarWidth).toBe(240);
      });

      it('does not clobber a width set via setSidebarWidth() while the IPC call is still in flight', async () => {
        let resolveGet!: (value: { ok: true; data: string }) => void;
        const pending = new Promise<{ ok: true; data: string }>((resolve) => {
          resolveGet = resolve;
        });
        installMockApi({ get: vi.fn().mockReturnValue(pending) });

        const initPromise = useUIStore.getState().initSidebarWidth();
        useUIStore.getState().setSidebarWidth(350);

        resolveGet({ ok: true, data: '260' }); // the (now-stale) persisted value
        await initPromise;

        expect(useUIStore.getState().sidebarWidth).toBe(350);
      });
    });
  });

  describe('sidebar collapsed', () => {
    it('defaults sidebarCollapsed to false', () => {
      expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    });

    it('updates sidebarCollapsed via setSidebarCollapsed, and persists the choice', async () => {
      const api = installMockApi();

      useUIStore.getState().setSidebarCollapsed(true);

      expect(useUIStore.getState().sidebarCollapsed).toBe(true);
      await Promise.resolve();
      expect(api.set).toHaveBeenCalledWith('sidebar_collapsed', 'true');
    });

    describe('initSidebarCollapsed', () => {
      it('applies a persisted "true" value', async () => {
        installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: 'true' }) });

        await useUIStore.getState().initSidebarCollapsed();

        expect(useUIStore.getState().sidebarCollapsed).toBe(true);
      });

      it('falls back to the current default when nothing is persisted', async () => {
        await useUIStore.getState().initSidebarCollapsed();

        expect(useUIStore.getState().sidebarCollapsed).toBe(false);
      });

      it('does not clobber a value set via setSidebarCollapsed() while the IPC call is still in flight', async () => {
        let resolveGet!: (value: { ok: true; data: string }) => void;
        const pending = new Promise<{ ok: true; data: string }>((resolve) => {
          resolveGet = resolve;
        });
        installMockApi({ get: vi.fn().mockReturnValue(pending) });

        const initPromise = useUIStore.getState().initSidebarCollapsed();
        useUIStore.getState().setSidebarCollapsed(true);

        resolveGet({ ok: true, data: 'false' }); // the (now-stale) persisted value
        await initPromise;

        expect(useUIStore.getState().sidebarCollapsed).toBe(true);
      });
    });
  });

  describe('always on top', () => {
    it('defaults alwaysOnTop to false', () => {
      expect(useUIStore.getState().alwaysOnTop).toBe(false);
    });

    it('sets alwaysOnTop optimistically and applies it via windowService', async () => {
      installMockApi();

      const applied = useUIStore.getState().setAlwaysOnTop(true);

      expect(useUIStore.getState().alwaysOnTop).toBe(true);
      await applied;
      expect(window.storyNoteAPI.window.setAlwaysOnTop).toHaveBeenCalledWith(true);
    });

    it('reverts alwaysOnTop when the main process call fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      installMockApi(
        {},
        { setAlwaysOnTop: vi.fn().mockResolvedValue({ ok: false, message: 'failed' }) },
      );

      await useUIStore.getState().setAlwaysOnTop(true);

      expect(useUIStore.getState().alwaysOnTop).toBe(false);
    });

    describe('initAlwaysOnTop', () => {
      it('applies a persisted "true" value', async () => {
        installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: 'true' }) });

        await useUIStore.getState().initAlwaysOnTop();

        expect(useUIStore.getState().alwaysOnTop).toBe(true);
      });

      it('falls back to the current default when nothing is persisted', async () => {
        await useUIStore.getState().initAlwaysOnTop();

        expect(useUIStore.getState().alwaysOnTop).toBe(false);
      });
    });
  });

  describe('launch on startup', () => {
    it('defaults launchOnStartup to false', () => {
      expect(useUIStore.getState().launchOnStartup).toBe(false);
    });

    it('sets launchOnStartup optimistically and applies it via windowService', async () => {
      installMockApi();

      const applied = useUIStore.getState().setLaunchOnStartup(true);

      expect(useUIStore.getState().launchOnStartup).toBe(true);
      await applied;
      expect(window.storyNoteAPI.window.setLaunchOnStartup).toHaveBeenCalledWith(true);
    });

    it('reverts launchOnStartup when the main process call fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      installMockApi(
        {},
        { setLaunchOnStartup: vi.fn().mockResolvedValue({ ok: false, message: 'failed' }) },
      );

      await useUIStore.getState().setLaunchOnStartup(true);

      expect(useUIStore.getState().launchOnStartup).toBe(false);
    });

    describe('initLaunchOnStartup', () => {
      it('applies a persisted "true" value', async () => {
        installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: 'true' }) });

        await useUIStore.getState().initLaunchOnStartup();

        expect(useUIStore.getState().launchOnStartup).toBe(true);
      });
    });
  });

  describe('start minimized', () => {
    it('defaults startMinimized to false', () => {
      expect(useUIStore.getState().startMinimized).toBe(false);
    });

    it('updates startMinimized via setStartMinimized, and persists the choice', async () => {
      const api = installMockApi();

      useUIStore.getState().setStartMinimized(true);

      expect(useUIStore.getState().startMinimized).toBe(true);
      await Promise.resolve();
      expect(api.set).toHaveBeenCalledWith('start_minimized', 'true');
    });

    describe('initStartMinimized', () => {
      it('applies a persisted "true" value', async () => {
        installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: 'true' }) });

        await useUIStore.getState().initStartMinimized();

        expect(useUIStore.getState().startMinimized).toBe(true);
      });
    });
  });
});
