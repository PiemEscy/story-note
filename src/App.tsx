import { useUIStore } from './store/useUIStore';
import NoteEditor from './editor/NoteEditor';

function App(): React.JSX.Element {
  const theme = useUIStore((state) => state.theme);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-3xl font-semibold">StoryNote</h1>
      <p className="text-neutral-400">Tailwind CSS is wired up and working.</p>
      <p className="text-sm text-neutral-500">Zustand theme state: {theme}</p>
      <NoteEditor />
    </div>
  );
}

export default App;
