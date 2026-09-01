import { useEffect } from 'react';
import Sidebar from './components/Sidebar';
import NoteList from './components/NoteList';
import EditorPanel from './components/EditorPanel';
import { useNoteStore } from './store/useNoteStore';
import { useLabelStore } from './store/useLabelStore';
import { useUIStore } from './store/useUIStore';

function App(): React.JSX.Element {
  const loadNotes = useNoteStore((state) => state.loadNotes);
  const loadNoteCounts = useNoteStore((state) => state.loadNoteCounts);
  const initSort = useNoteStore((state) => state.initSort);
  const error = useNoteStore((state) => state.error);
  const clearError = useNoteStore((state) => state.clearError);
  const loadLabels = useLabelStore((state) => state.loadLabels);
  const initTheme = useUIStore((state) => state.initTheme);
  const initView = useUIStore((state) => state.initView);

  useEffect(() => {
    void loadNotes();
    void loadNoteCounts();
    // Runs after the initial loadNotes() above — if the persisted sort
    // differs from the default it started with, initSort() re-triggers its
    // own loadNotes() once it resolves (see useNoteStore.ts).
    void initSort();
    void loadLabels();
    void initTheme();
    void initView();
  }, [loadNotes, loadNoteCounts, initSort, loadLabels, initTheme, initView]);

  return (
    <div className="relative flex h-full overflow-hidden border-t border-[var(--border)]">
      <Sidebar />
      <NoteList />
      <EditorPanel />

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
