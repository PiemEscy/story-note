import { useEffect } from 'react';
import Sidebar from './components/Sidebar';
import NoteList from './components/NoteList';
import EditorPanel from './components/EditorPanel';
import ToastContainer from './components/ToastContainer';
import { useNoteStore } from './store/useNoteStore';
import { useLabelStore } from './store/useLabelStore';
import { useUIStore } from './store/useUIStore';

function App(): React.JSX.Element {
  const loadNotes = useNoteStore((state) => state.loadNotes);
  const loadNoteCounts = useNoteStore((state) => state.loadNoteCounts);
  const initSort = useNoteStore((state) => state.initSort);
  const initLastNote = useNoteStore((state) => state.initLastNote);
  const createNote = useNoteStore((state) => state.createNote);
  const lockAllNotes = useNoteStore((state) => state.lockAllNotes);
  const error = useNoteStore((state) => state.error);
  const clearError = useNoteStore((state) => state.clearError);
  const loadLabels = useLabelStore((state) => state.loadLabels);
  const initTheme = useUIStore((state) => state.initTheme);
  const initView = useUIStore((state) => state.initView);
  const initCompactMode = useUIStore((state) => state.initCompactMode);
  const initSidebarWidth = useUIStore((state) => state.initSidebarWidth);
  const initSidebarCollapsed = useUIStore((state) => state.initSidebarCollapsed);
  const initAlwaysOnTop = useUIStore((state) => state.initAlwaysOnTop);
  const initLaunchOnStartup = useUIStore((state) => state.initLaunchOnStartup);
  const initStartMinimized = useUIStore((state) => state.initStartMinimized);
  const initNoteFontFamily = useUIStore((state) => state.initNoteFontFamily);
  const initNoteFontSize = useUIStore((state) => state.initNoteFontSize);
  const initNoteContentWidth = useUIStore((state) => state.initNoteContentWidth);
  const initNoteZoom = useUIStore((state) => state.initNoteZoom);
  const initNoteLineHeight = useUIStore((state) => state.initNoteLineHeight);
  const initDefaultLabelId = useUIStore((state) => state.initDefaultLabelId);

  useEffect(() => {
    // initLastNote needs the 'active' list actually loaded before it can
    // tell whether the persisted note still exists — chained after
    // loadNotes() resolves rather than fired concurrently alongside it.
    void loadNotes().then(() => {
      void initLastNote();
    });
    void loadNoteCounts();
    // Runs after the initial loadNotes() above — if the persisted sort
    // differs from the default it started with, initSort() re-triggers its
    // own loadNotes() once it resolves (see useNoteStore.ts).
    void initSort();
    void loadLabels();
    void initTheme();
    void initView();
    void initCompactMode();
    void initSidebarWidth();
    void initSidebarCollapsed();
    void initAlwaysOnTop();
    void initLaunchOnStartup();
    void initStartMinimized();
    void initNoteFontFamily();
    void initNoteFontSize();
    void initNoteContentWidth();
    void initNoteZoom();
    void initNoteLineHeight();
    void initDefaultLabelId();
  }, [
    loadNotes,
    loadNoteCounts,
    initSort,
    initLastNote,
    loadLabels,
    initTheme,
    initView,
    initCompactMode,
    initSidebarWidth,
    initSidebarCollapsed,
    initAlwaysOnTop,
    initLaunchOnStartup,
    initStartMinimized,
    initNoteFontFamily,
    initNoteFontSize,
    initNoteContentWidth,
    initNoteZoom,
    initNoteLineHeight,
    initDefaultLabelId,
  ]);

  // Phase 10's global keyboard shortcuts (electron/shortcuts.ts) fire from
  // the main process regardless of which window/app has focus — 'new-note'
  // and 'quick-lock' are handled here since they're store-level actions;
  // 'focus-search' is handled in Sidebar.tsx instead, since focusing an
  // input needs the ref only that component holds.
  useEffect(() => {
    return window.storyNoteAPI.shortcuts.onTrigger((action) => {
      if (action === 'new-note') void createNote();
      if (action === 'quick-lock') void lockAllNotes();
    });
  }, [createNote, lockAllNotes]);

  return (
    <div className="relative flex h-full overflow-hidden border-t border-[var(--border)]">
      <Sidebar />
      <NoteList />
      <EditorPanel />
      <ToastContainer />

      {error && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--bg-surface-raised)] px-4 py-2 text-[12.5px] text-[#DC2626] shadow-[0_4px_16px_rgba(15,23,42,0.12)]">
          {error}
          <button
            type="button"
            onClick={clearError}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
