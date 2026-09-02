import { create } from 'zustand';
import { settingsService } from '../services/settingsService';
import { windowService } from '../services/windowService';

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

// Note Editor Updates — note content display settings. Three presets rather
// than a free-text font picker (no font-browsing UI exists, and these three
// already match this app's own established --font-content/--font-ui/
// --font-mono stacks from main.css, so no new font stack needed).
export type NoteFontFamily = 'serif' | 'sans' | 'mono';
const NOTE_FONT_FAMILIES: NoteFontFamily[] = ['serif', 'sans', 'mono'];

function isNoteFontFamily(value: string | undefined): value is NoteFontFamily {
  return NOTE_FONT_FAMILIES.includes(value as NoteFontFamily);
}

const NOTE_FONT_FAMILY_CSS_VALUE: Record<NoteFontFamily, string> = {
  serif: 'var(--font-content)',
  sans: 'var(--font-ui)',
  mono: 'var(--font-mono)',
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Applied as inline custom properties on <html> (main.css's :root defines
// the fallback defaults) — same mechanism setTheme uses for [data-theme],
// so every open note's content responds immediately with no per-note prop.
function applyNoteFontFamily(family: NoteFontFamily): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty(
    '--note-font-family',
    NOTE_FONT_FAMILY_CSS_VALUE[family],
  );
}
function applyNoteFontSize(size: number): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--note-font-size', `${size}px`);
}
function applyNoteContentWidth(width: number): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--note-content-width', `${width}px`);
}
function applyNoteZoom(zoom: number): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--note-zoom', String(zoom));
}
function applyNoteLineHeight(lineHeight: number): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--note-line-height', String(lineHeight));
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

  // Sidebar collapse-to-icon-rail toggle. Persisted to
  // settings.sidebar_collapsed; built by mirroring compactMode exactly.
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  initSidebarCollapsed: () => Promise<void>;

  // Phase 11 — Settings panel. Unlike compactMode/theme above, these two go
  // through windowService (not settingsService directly): the live window
  // and the OS login-item registration both need to change immediately, not
  // just on the next launch (electron/ipc/windowHandlers.ts persists the
  // setting as part of the same call).
  alwaysOnTop: boolean;
  setAlwaysOnTop: (value: boolean) => Promise<void>;
  initAlwaysOnTop: () => Promise<void>;

  launchOnStartup: boolean;
  setLaunchOnStartup: (value: boolean) => Promise<void>;
  initLaunchOnStartup: () => Promise<void>;

  // Only matters on the *next* launch (electron/main.ts's createWindow reads
  // it once, at construction) — no live window effect to apply now, so this
  // persists straight through settingsService like compactMode/theme.
  startMinimized: boolean;
  setStartMinimized: (value: boolean) => void;
  initStartMinimized: () => Promise<void>;

  // Note Editor Updates — font family/size, content-column width ("margin"),
  // and zoom. All four apply globally (every note, not per-note) and
  // persist through settingsService, mirroring compactMode/theme exactly.
  noteFontFamily: NoteFontFamily;
  setNoteFontFamily: (family: NoteFontFamily) => void;
  initNoteFontFamily: () => Promise<void>;

  noteFontSize: number;
  setNoteFontSize: (size: number) => void;
  initNoteFontSize: () => Promise<void>;

  // The reading column's max-width (EditorPanel.tsx's .note-content-frame)
  // — narrower means more empty space on either side, wider means less.
  noteContentWidth: number;
  setNoteContentWidth: (width: number) => void;
  initNoteContentWidth: () => Promise<void>;

  // Scales the whole content view (CSS zoom, not just font-size) — separate
  // from noteFontSize per the spec. resetNoteZoom is a distinct action
  // (not just setNoteZoom(1)) so the Settings panel's "Reset" button reads
  // as its own affordance rather than a slider drag to a specific value.
  noteZoom: number;
  setNoteZoom: (zoom: number) => void;
  resetNoteZoom: () => void;
  initNoteZoom: () => Promise<void>;

  // Line spacing — a free numeric slider (not presets, per the enhancement
  // spec), applied the same way as the other note-content CSS custom
  // properties above.
  noteLineHeight: number;
  setNoteLineHeight: (lineHeight: number) => void;
  initNoteLineHeight: () => Promise<void>;

  // The label auto-assigned to notes created via "New note" and .txt import
  // — null means no default (today's existing behavior). Unlike the note-
  // content settings above, this isn't applied as a CSS property; callers
  // (useNoteStore's createNote/importNotes) read defaultLabelId directly.
  defaultLabelId: number | null;
  setDefaultLabelId: (labelId: number | null) => void;
  initDefaultLabelId: () => Promise<void>;
}

function parseBooleanSetting(stored: string | undefined, fallback: boolean): boolean {
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return fallback;
}

export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 480;
export const SIDEBAR_DEFAULT_WIDTH = 240;
export const SIDEBAR_COLLAPSED_WIDTH = 56;

export const NOTE_FONT_SIZE_MIN = 13;
export const NOTE_FONT_SIZE_MAX = 22;
export const NOTE_FONT_SIZE_DEFAULT = 16.5;
export const NOTE_FONT_SIZE_STEP = 0.5;

export const NOTE_CONTENT_WIDTH_MIN = 480;
export const NOTE_CONTENT_WIDTH_MAX = 1340;
export const NOTE_CONTENT_WIDTH_DEFAULT = 720;
export const NOTE_CONTENT_WIDTH_STEP = 20;

export const NOTE_ZOOM_MIN = 0.5;
export const NOTE_ZOOM_MAX = 2;
export const NOTE_ZOOM_DEFAULT = 1;
export const NOTE_ZOOM_STEP = 0.1;

export const NOTE_LINE_HEIGHT_MIN = 1.2;
export const NOTE_LINE_HEIGHT_MAX = 2.2;
export const NOTE_LINE_HEIGHT_DEFAULT = 1.75;
export const NOTE_LINE_HEIGHT_STEP = 0.05;

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

  sidebarCollapsed: false,

  setSidebarCollapsed: (sidebarCollapsed) => {
    set({ sidebarCollapsed });
    settingsService.set('sidebar_collapsed', String(sidebarCollapsed)).catch((error: unknown) => {
      console.error('[useUIStore] failed to persist sidebar_collapsed setting', error);
    });
  },

  initSidebarCollapsed: async () => {
    const before = get().sidebarCollapsed;
    let sidebarCollapsed = before;
    try {
      const stored = await settingsService.get('sidebar_collapsed');
      sidebarCollapsed = parseBooleanSetting(stored, before);
    } catch (error) {
      console.error('[useUIStore] failed to load persisted sidebar_collapsed setting', error);
    }
    if (get().sidebarCollapsed !== before) return;
    set({ sidebarCollapsed });
  },

  alwaysOnTop: false,

  setAlwaysOnTop: async (value) => {
    // Applied optimistically, before the IPC round trip resolves — matches
    // setCompactMode/setTheme's synchronous-set pattern above so the
    // Settings panel's checkbox responds immediately; reverted if the main
    // process call itself fails, rather than left showing a value that
    // silently didn't take.
    set({ alwaysOnTop: value });
    try {
      await windowService.setAlwaysOnTop(value);
    } catch (error) {
      console.error('[useUIStore] failed to apply always_on_top setting', error);
      set({ alwaysOnTop: !value });
    }
  },

  initAlwaysOnTop: async () => {
    const before = get().alwaysOnTop;
    let alwaysOnTop = before;
    try {
      const stored = await settingsService.get('always_on_top');
      alwaysOnTop = parseBooleanSetting(stored, before);
    } catch (error) {
      console.error('[useUIStore] failed to load persisted always_on_top setting', error);
    }
    if (get().alwaysOnTop !== before) return;
    set({ alwaysOnTop });
  },

  launchOnStartup: false,

  setLaunchOnStartup: async (value) => {
    set({ launchOnStartup: value });
    try {
      await windowService.setLaunchOnStartup(value);
    } catch (error) {
      console.error('[useUIStore] failed to apply launch_on_startup setting', error);
      set({ launchOnStartup: !value });
    }
  },

  initLaunchOnStartup: async () => {
    const before = get().launchOnStartup;
    let launchOnStartup = before;
    try {
      const stored = await settingsService.get('launch_on_startup');
      launchOnStartup = parseBooleanSetting(stored, before);
    } catch (error) {
      console.error('[useUIStore] failed to load persisted launch_on_startup setting', error);
    }
    if (get().launchOnStartup !== before) return;
    set({ launchOnStartup });
  },

  startMinimized: false,

  setStartMinimized: (value) => {
    set({ startMinimized: value });
    settingsService.set('start_minimized', String(value)).catch((error: unknown) => {
      console.error('[useUIStore] failed to persist start_minimized setting', error);
    });
  },

  initStartMinimized: async () => {
    const before = get().startMinimized;
    let startMinimized = before;
    try {
      const stored = await settingsService.get('start_minimized');
      startMinimized = parseBooleanSetting(stored, before);
    } catch (error) {
      console.error('[useUIStore] failed to load persisted start_minimized setting', error);
    }
    if (get().startMinimized !== before) return;
    set({ startMinimized });
  },

  noteFontFamily: 'serif',

  setNoteFontFamily: (noteFontFamily) => {
    set({ noteFontFamily });
    applyNoteFontFamily(noteFontFamily);
    settingsService.set('note_font_family', noteFontFamily).catch((error: unknown) => {
      console.error('[useUIStore] failed to persist note_font_family setting', error);
    });
  },

  initNoteFontFamily: async () => {
    const before = get().noteFontFamily;
    let noteFontFamily = before;
    try {
      const stored = await settingsService.get('note_font_family');
      if (isNoteFontFamily(stored)) noteFontFamily = stored;
    } catch (error) {
      console.error('[useUIStore] failed to load persisted note_font_family setting', error);
    }
    if (get().noteFontFamily !== before) return;
    set({ noteFontFamily });
    applyNoteFontFamily(noteFontFamily);
  },

  noteFontSize: NOTE_FONT_SIZE_DEFAULT,

  setNoteFontSize: (size) => {
    const noteFontSize = clamp(size, NOTE_FONT_SIZE_MIN, NOTE_FONT_SIZE_MAX);
    set({ noteFontSize });
    applyNoteFontSize(noteFontSize);
    settingsService.set('note_font_size', String(noteFontSize)).catch((error: unknown) => {
      console.error('[useUIStore] failed to persist note_font_size setting', error);
    });
  },

  initNoteFontSize: async () => {
    const before = get().noteFontSize;
    let noteFontSize = before;
    try {
      const stored = await settingsService.get('note_font_size');
      const parsed = stored !== undefined ? Number(stored) : NaN;
      if (Number.isFinite(parsed)) {
        noteFontSize = clamp(parsed, NOTE_FONT_SIZE_MIN, NOTE_FONT_SIZE_MAX);
      }
    } catch (error) {
      console.error('[useUIStore] failed to load persisted note_font_size setting', error);
    }
    if (get().noteFontSize !== before) return;
    set({ noteFontSize });
    applyNoteFontSize(noteFontSize);
  },

  noteContentWidth: NOTE_CONTENT_WIDTH_DEFAULT,

  setNoteContentWidth: (width) => {
    const noteContentWidth = clamp(width, NOTE_CONTENT_WIDTH_MIN, NOTE_CONTENT_WIDTH_MAX);
    set({ noteContentWidth });
    applyNoteContentWidth(noteContentWidth);
    settingsService.set('note_content_width', String(noteContentWidth)).catch((error: unknown) => {
      console.error('[useUIStore] failed to persist note_content_width setting', error);
    });
  },

  initNoteContentWidth: async () => {
    const before = get().noteContentWidth;
    let noteContentWidth = before;
    try {
      const stored = await settingsService.get('note_content_width');
      const parsed = stored !== undefined ? Number(stored) : NaN;
      if (Number.isFinite(parsed)) {
        noteContentWidth = clamp(parsed, NOTE_CONTENT_WIDTH_MIN, NOTE_CONTENT_WIDTH_MAX);
      }
    } catch (error) {
      console.error('[useUIStore] failed to load persisted note_content_width setting', error);
    }
    if (get().noteContentWidth !== before) return;
    set({ noteContentWidth });
    applyNoteContentWidth(noteContentWidth);
  },

  noteZoom: NOTE_ZOOM_DEFAULT,

  setNoteZoom: (zoom) => {
    const noteZoom = clamp(zoom, NOTE_ZOOM_MIN, NOTE_ZOOM_MAX);
    set({ noteZoom });
    applyNoteZoom(noteZoom);
    settingsService.set('note_zoom', String(noteZoom)).catch((error: unknown) => {
      console.error('[useUIStore] failed to persist note_zoom setting', error);
    });
  },

  resetNoteZoom: () => {
    get().setNoteZoom(NOTE_ZOOM_DEFAULT);
  },

  initNoteZoom: async () => {
    const before = get().noteZoom;
    let noteZoom = before;
    try {
      const stored = await settingsService.get('note_zoom');
      const parsed = stored !== undefined ? Number(stored) : NaN;
      if (Number.isFinite(parsed)) {
        noteZoom = clamp(parsed, NOTE_ZOOM_MIN, NOTE_ZOOM_MAX);
      }
    } catch (error) {
      console.error('[useUIStore] failed to load persisted note_zoom setting', error);
    }
    if (get().noteZoom !== before) return;
    set({ noteZoom });
    applyNoteZoom(noteZoom);
  },

  noteLineHeight: NOTE_LINE_HEIGHT_DEFAULT,

  setNoteLineHeight: (lineHeight) => {
    const noteLineHeight = clamp(lineHeight, NOTE_LINE_HEIGHT_MIN, NOTE_LINE_HEIGHT_MAX);
    set({ noteLineHeight });
    applyNoteLineHeight(noteLineHeight);
    settingsService.set('note_line_height', String(noteLineHeight)).catch((error: unknown) => {
      console.error('[useUIStore] failed to persist note_line_height setting', error);
    });
  },

  initNoteLineHeight: async () => {
    const before = get().noteLineHeight;
    let noteLineHeight = before;
    try {
      const stored = await settingsService.get('note_line_height');
      const parsed = stored !== undefined ? Number(stored) : NaN;
      if (Number.isFinite(parsed)) {
        noteLineHeight = clamp(parsed, NOTE_LINE_HEIGHT_MIN, NOTE_LINE_HEIGHT_MAX);
      }
    } catch (error) {
      console.error('[useUIStore] failed to load persisted note_line_height setting', error);
    }
    if (get().noteLineHeight !== before) return;
    set({ noteLineHeight });
    applyNoteLineHeight(noteLineHeight);
  },

  defaultLabelId: null,

  setDefaultLabelId: (labelId) => {
    set({ defaultLabelId: labelId });
    const write =
      labelId === null
        ? settingsService.delete('default_label_id')
        : settingsService.set('default_label_id', String(labelId));
    write.catch((error: unknown) => {
      console.error('[useUIStore] failed to persist default_label_id setting', error);
    });
  },

  initDefaultLabelId: async () => {
    const before = get().defaultLabelId;
    let defaultLabelId = before;
    try {
      const stored = await settingsService.get('default_label_id');
      if (stored !== undefined) {
        const parsed = Number(stored);
        defaultLabelId = Number.isFinite(parsed) ? parsed : null;
      }
    } catch (error) {
      console.error('[useUIStore] failed to load persisted default_label_id setting', error);
    }
    if (get().defaultLabelId !== before) return;
    set({ defaultLabelId });
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
