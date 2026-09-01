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
    noteFontFamily: 'serif',
    noteFontSize: 16.5,
    noteContentWidth: 720,
    noteZoom: 1,
    noteLineHeight: 1.75,
    defaultLabelId: null,
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

  describe('note font family', () => {
    it('defaults noteFontFamily to serif', () => {
      expect(useUIStore.getState().noteFontFamily).toBe('serif');
    });

    it('updates noteFontFamily via setNoteFontFamily, applies it to <html>, and persists it', async () => {
      const api = installMockApi();

      useUIStore.getState().setNoteFontFamily('mono');

      expect(useUIStore.getState().noteFontFamily).toBe('mono');
      expect(document.documentElement.style.getPropertyValue('--note-font-family')).toBe(
        'var(--font-mono)',
      );
      await Promise.resolve();
      expect(api.set).toHaveBeenCalledWith('note_font_family', 'mono');
    });

    describe('initNoteFontFamily', () => {
      it('applies a valid persisted family', async () => {
        installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: 'sans' }) });

        await useUIStore.getState().initNoteFontFamily();

        expect(useUIStore.getState().noteFontFamily).toBe('sans');
      });

      it('falls back to the current default for an invalid persisted value', async () => {
        installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: 'comic-sans' }) });

        await useUIStore.getState().initNoteFontFamily();

        expect(useUIStore.getState().noteFontFamily).toBe('serif');
      });
    });
  });

  describe('note font size', () => {
    it('defaults noteFontSize to 16.5', () => {
      expect(useUIStore.getState().noteFontSize).toBe(16.5);
    });

    it('updates noteFontSize via setNoteFontSize, applies it to <html>, and persists it', async () => {
      const api = installMockApi();

      useUIStore.getState().setNoteFontSize(18);

      expect(useUIStore.getState().noteFontSize).toBe(18);
      expect(document.documentElement.style.getPropertyValue('--note-font-size')).toBe('18px');
      await Promise.resolve();
      expect(api.set).toHaveBeenCalledWith('note_font_size', '18');
    });

    it('clamps setNoteFontSize to [13, 22]', () => {
      installMockApi();

      useUIStore.getState().setNoteFontSize(5);
      expect(useUIStore.getState().noteFontSize).toBe(13);

      useUIStore.getState().setNoteFontSize(40);
      expect(useUIStore.getState().noteFontSize).toBe(22);
    });

    describe('initNoteFontSize', () => {
      it('applies a valid persisted size', async () => {
        installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: '19' }) });

        await useUIStore.getState().initNoteFontSize();

        expect(useUIStore.getState().noteFontSize).toBe(19);
      });

      it('clamps a persisted size outside [13, 22]', async () => {
        installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: '99' }) });

        await useUIStore.getState().initNoteFontSize();

        expect(useUIStore.getState().noteFontSize).toBe(22);
      });
    });
  });

  describe('note content width', () => {
    it('defaults noteContentWidth to 720', () => {
      expect(useUIStore.getState().noteContentWidth).toBe(720);
    });

    it('updates noteContentWidth via setNoteContentWidth, applies it to <html>, and persists it', async () => {
      const api = installMockApi();

      useUIStore.getState().setNoteContentWidth(600);

      expect(useUIStore.getState().noteContentWidth).toBe(600);
      expect(document.documentElement.style.getPropertyValue('--note-content-width')).toBe('600px');
      await Promise.resolve();
      expect(api.set).toHaveBeenCalledWith('note_content_width', '600');
    });

    it('clamps setNoteContentWidth to [480, 1340]', () => {
      installMockApi();

      useUIStore.getState().setNoteContentWidth(100);
      expect(useUIStore.getState().noteContentWidth).toBe(480);

      useUIStore.getState().setNoteContentWidth(2000);
      expect(useUIStore.getState().noteContentWidth).toBe(1340);
    });

    describe('initNoteContentWidth', () => {
      it('applies a valid persisted width', async () => {
        installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: '840' }) });

        await useUIStore.getState().initNoteContentWidth();

        expect(useUIStore.getState().noteContentWidth).toBe(840);
      });
    });
  });

  describe('note zoom', () => {
    it('defaults noteZoom to 1', () => {
      expect(useUIStore.getState().noteZoom).toBe(1);
    });

    it('updates noteZoom via setNoteZoom, applies it to <html>, and persists it', async () => {
      const api = installMockApi();

      useUIStore.getState().setNoteZoom(1.5);

      expect(useUIStore.getState().noteZoom).toBe(1.5);
      expect(document.documentElement.style.getPropertyValue('--note-zoom')).toBe('1.5');
      await Promise.resolve();
      expect(api.set).toHaveBeenCalledWith('note_zoom', '1.5');
    });

    it('clamps setNoteZoom to [0.5, 2]', () => {
      installMockApi();

      useUIStore.getState().setNoteZoom(0.1);
      expect(useUIStore.getState().noteZoom).toBe(0.5);

      useUIStore.getState().setNoteZoom(5);
      expect(useUIStore.getState().noteZoom).toBe(2);
    });

    it('resetNoteZoom sets noteZoom back to 1 and persists it', async () => {
      const api = installMockApi();
      useUIStore.getState().setNoteZoom(1.8);

      useUIStore.getState().resetNoteZoom();

      expect(useUIStore.getState().noteZoom).toBe(1);
      await Promise.resolve();
      expect(api.set).toHaveBeenCalledWith('note_zoom', '1');
    });

    describe('initNoteZoom', () => {
      it('applies a valid persisted zoom', async () => {
        installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: '1.2' }) });

        await useUIStore.getState().initNoteZoom();

        expect(useUIStore.getState().noteZoom).toBe(1.2);
      });
    });
  });

  describe('note line height', () => {
    it('defaults noteLineHeight to 1.75', () => {
      expect(useUIStore.getState().noteLineHeight).toBe(1.75);
    });

    it('updates noteLineHeight via setNoteLineHeight, applies it to <html>, and persists it', async () => {
      const api = installMockApi();

      useUIStore.getState().setNoteLineHeight(2);

      expect(useUIStore.getState().noteLineHeight).toBe(2);
      expect(document.documentElement.style.getPropertyValue('--note-line-height')).toBe('2');
      await Promise.resolve();
      expect(api.set).toHaveBeenCalledWith('note_line_height', '2');
    });

    it('clamps setNoteLineHeight to [1.2, 2.2]', () => {
      installMockApi();

      useUIStore.getState().setNoteLineHeight(0.5);
      expect(useUIStore.getState().noteLineHeight).toBe(1.2);

      useUIStore.getState().setNoteLineHeight(5);
      expect(useUIStore.getState().noteLineHeight).toBe(2.2);
    });

    describe('initNoteLineHeight', () => {
      it('applies a valid persisted line height', async () => {
        installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: '1.5' }) });

        await useUIStore.getState().initNoteLineHeight();

        expect(useUIStore.getState().noteLineHeight).toBe(1.5);
      });

      it('clamps a persisted line height outside [1.2, 2.2]', async () => {
        installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: '10' }) });

        await useUIStore.getState().initNoteLineHeight();

        expect(useUIStore.getState().noteLineHeight).toBe(2.2);
      });
    });
  });

  describe('default label', () => {
    it('defaults defaultLabelId to null', () => {
      expect(useUIStore.getState().defaultLabelId).toBeNull();
    });

    it('updates defaultLabelId via setDefaultLabelId, and persists it', async () => {
      const api = installMockApi();

      useUIStore.getState().setDefaultLabelId(7);

      expect(useUIStore.getState().defaultLabelId).toBe(7);
      await Promise.resolve();
      expect(api.set).toHaveBeenCalledWith('default_label_id', '7');
    });

    it('deletes the persisted setting when set back to null', async () => {
      const api = installMockApi();
      useUIStore.getState().setDefaultLabelId(7);

      useUIStore.getState().setDefaultLabelId(null);

      expect(useUIStore.getState().defaultLabelId).toBeNull();
      await Promise.resolve();
      expect(api.delete).toHaveBeenCalledWith('default_label_id');
    });

    describe('initDefaultLabelId', () => {
      it('applies a valid persisted label id', async () => {
        installMockApi({ get: vi.fn().mockResolvedValue({ ok: true, data: '4' }) });

        await useUIStore.getState().initDefaultLabelId();

        expect(useUIStore.getState().defaultLabelId).toBe(4);
      });

      it('stays null when nothing is persisted', async () => {
        await useUIStore.getState().initDefaultLabelId();

        expect(useUIStore.getState().defaultLabelId).toBeNull();
      });
    });
  });
});
