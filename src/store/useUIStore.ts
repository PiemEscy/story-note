import { create } from 'zustand';
import { settingsService } from '../services/settingsService';

export type ThemeMode = 'dark' | 'light' | 'system';
type ResolvedTheme = 'dark' | 'light';

const THEME_MODES: ThemeMode[] = ['dark', 'light', 'system'];

function isThemeMode(value: string | undefined): value is ThemeMode {
  return THEME_MODES.includes(value as ThemeMode);
}

// Matches schema.md's settings.last_view example value ("sidebar") and
// storynote-ui-reference.html's data-set-view options.
export type ViewMode = 'sidebar' | 'list' | 'details' | 'grid' | 'largegrid';

const VIEW_MODES: ViewMode[] = ['sidebar', 'list', 'details', 'grid', 'largegrid'];

function isViewMode(value: string | undefined): value is ViewMode {
  return VIEW_MODES.includes(value as ViewMode);
}

// jsdom (Vitest's renderer test environment) doesn't implement matchMedia —
// fall back to 'light' there rather than throwing on module load.
function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolve(theme: ThemeMode): ResolvedTheme {
  return theme === 'system' ? getSystemTheme() : theme;
}

// Matches storynote-ui-reference.html's own [data-theme="light"|"dark"]
// attribute selector — see src/assets/main.css for the token values.
function applyToDocument(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolved;
}

interface UIState {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
  // Reads the persisted preference (settings.theme) and applies it, then
  // starts following OS theme changes while the preference is 'system'.
  // Settings UI to change this doesn't exist yet (Phase 11), but the IPC
  // plumbing (Phase 2) and mechanism are real, not a placeholder.
  initTheme: () => Promise<void>;

  view: ViewMode;
  setView: (view: ViewMode) => void;
  // Reads the persisted preference (settings.last_view) and applies it.
  // Mirrors initTheme, including its guard against a later-resolving load
  // clobbering a choice the user made (e.g. via the view switcher) while
  // this was still in flight.
  initView: () => Promise<void>;

  // Whether a note is currently open full-screen over a non-Sidebar view's
  // listing (List/Details/Grid/Large Grid have no inline list-alongside-
  // editor layout — see NoteList.tsx/EditorPanel.tsx). Deliberately not
  // derived from useNoteStore's activeNoteId: that's set by createNote() and
  // stays set across view switches, so deriving "is the detail overlay
  // open" from it alone meant switching views while a note happened to
  // already be active (e.g. right after creating one) jumped straight into
  // the overlay instead of showing the fresh listing.
  isNoteDetailOpen: boolean;
  openNoteDetail: () => void;
  closeNoteDetail: () => void;

  // Phase 10 — matches storynote-ui-reference.html's .is-compact (reduced
  // padding on the list toolbar and note rows). Persisted to
  // settings.compact_mode; built by mirroring setTheme/initTheme exactly.
  compactMode: boolean;
  setCompactMode: (compactMode: boolean) => void;
  initCompactMode: () => Promise<void>;

  // Phase 10 — storynote-ui-reference.html's .sidebar-resize-handle.
  // Persisted to settings.sidebar_width (schema.md). Clamped the same way
  // on both the write side (setSidebarWidth) and the read side
  // (initSidebarWidth) — a value from a corrupted/hand-edited settings row
  // shouldn't be able to wedge the sidebar at an unusable width any more
  // than a live drag can.
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  initSidebarWidth: () => Promise<void>;
}

export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 480;
export const SIDEBAR_DEFAULT_WIDTH = 240;

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

export const useUIStore = create<UIState>((set, get) => ({
  theme: 'system',
  resolvedTheme: resolve('system'),

  setTheme: (theme) => {
    const resolvedTheme = resolve(theme);
    set({ theme, resolvedTheme });
    applyToDocument(resolvedTheme);
    settingsService.set('theme', theme).catch((error: unknown) => {
      console.error('[useUIStore] failed to persist theme setting', error);
    });
  },

  initTheme: async () => {
    // If the user calls setTheme() (e.g. clicks the toggle) while this is
    // still awaiting the IPC round trip, applying the persisted value we
    // started loading would clobber their just-made choice with a stale
    // one — bail out rather than overwrite whatever's current by then.
    const before = get().theme;
    let theme = before;
    try {
      const stored = await settingsService.get('theme');
      if (isThemeMode(stored)) theme = stored;
    } catch (error) {
      console.error('[useUIStore] failed to load persisted theme setting', error);
    }
    if (get().theme !== before) return;
    const resolvedTheme = resolve(theme);
    set({ theme, resolvedTheme });
    applyToDocument(resolvedTheme);
  },

  view: 'sidebar',

  setView: (view) => {
    // Switching views always lands back on that view's fresh listing, never
    // straight into whatever note happened to be open before — same
    // reasoning as the isNoteDetailOpen doc comment above.
    set({ view, isNoteDetailOpen: false });
    settingsService.set('last_view', view).catch((error: unknown) => {
      console.error('[useUIStore] failed to persist last_view setting', error);
    });
  },

  initView: async () => {
    const before = get().view;
    let view = before;
    try {
      const stored = await settingsService.get('last_view');
      if (isViewMode(stored)) view = stored;
    } catch (error) {
      console.error('[useUIStore] failed to load persisted last_view setting', error);
    }
    if (get().view !== before) return;
    set({ view });
  },

  isNoteDetailOpen: false,
  openNoteDetail: () => set({ isNoteDetailOpen: true }),
  closeNoteDetail: () => set({ isNoteDetailOpen: false }),

  compactMode: false,

  setCompactMode: (compactMode) => {
    set({ compactMode });
    settingsService.set('compact_mode', String(compactMode)).catch((error: unknown) => {
      console.error('[useUIStore] failed to persist compact_mode setting', error);
    });
  },

  initCompactMode: async () => {
    const before = get().compactMode;
    let compactMode = before;
    try {
      const stored = await settingsService.get('compact_mode');
      if (stored === 'true' || stored === 'false') compactMode = stored === 'true';
    } catch (error) {
      console.error('[useUIStore] failed to load persisted compact_mode setting', error);
    }
    if (get().compactMode !== before) return;
    set({ compactMode });
  },

  sidebarWidth: SIDEBAR_DEFAULT_WIDTH,

  setSidebarWidth: (width) => {
    const sidebarWidth = clampSidebarWidth(width);
    set({ sidebarWidth });
    settingsService.set('sidebar_width', String(sidebarWidth)).catch((error: unknown) => {
      console.error('[useUIStore] failed to persist sidebar_width setting', error);
    });
  },

  initSidebarWidth: async () => {
    const before = get().sidebarWidth;
    let sidebarWidth = before;
    try {
      const stored = await settingsService.get('sidebar_width');
      const parsed = stored !== undefined ? Number(stored) : NaN;
      if (Number.isFinite(parsed)) sidebarWidth = clampSidebarWidth(parsed);
    } catch (error) {
      console.error('[useUIStore] failed to load persisted sidebar_width setting', error);
    }
    if (get().sidebarWidth !== before) return;
    set({ sidebarWidth });
  },
}));

// Live-updates resolvedTheme (and the DOM attribute) when the OS theme
// changes while the user's preference is 'system' — "System" means "follow
// the OS", not "snapshot it once at launch".
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useUIStore.getState().theme !== 'system') return;
    const resolvedTheme = resolve('system');
    useUIStore.setState({ resolvedTheme });
    applyToDocument(resolvedTheme);
  });
}
