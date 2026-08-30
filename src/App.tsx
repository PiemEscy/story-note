import { useEffect } from 'react';
import Sidebar from './components/Sidebar';
import NoteList from './components/NoteList';
import EditorPanel from './components/EditorPanel';
import { useNoteStore } from './store/useNoteStore';

function App(): React.JSX.Element {
  const loadNotes = useNoteStore((state) => state.loadNotes);
  const error = useNoteStore((state) => state.error);
  const clearError = useNoteStore((state) => state.clearError);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  return (
    <div className="relative flex h-full overflow-hidden border-t border-[#E2E5EA]">
      <Sidebar />
      <NoteList />
      <EditorPanel />

      {error && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-md border border-[#E2E5EA] bg-white px-4 py-2 text-[12.5px] text-[#DC2626] shadow-[0_4px_16px_rgba(15,23,42,0.12)]">
          {error}
          <button
            type="button"
            onClick={clearError}
            className="text-[#8992A0] hover:text-[#14181F]"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
