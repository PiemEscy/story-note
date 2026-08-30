import { useNoteStore } from '../store/useNoteStore';
import type { NoteFilter } from '../store/useNoteStore';
import { AllNotesIcon, ArchivedIcon, TrashNavIcon, NewNoteIcon } from './icons';

// Pinned/Locked nav items and the Labels section from the UI reference are
// deliberately omitted here — they belong to Phase 9 (pin), Phase 8 (lock),
// and Phase 5 (labels) respectively, none of which exist yet. Rendering them
// now would be dead UI (code-style.md: no half-finished implementations).
const NAV_ITEMS: { filter: NoteFilter; label: string; Icon: typeof AllNotesIcon }[] = [
  { filter: 'active', label: 'All Notes', Icon: AllNotesIcon },
  { filter: 'archived', label: 'Archived', Icon: ArchivedIcon },
  { filter: 'trash', label: 'Trash', Icon: TrashNavIcon },
];

function Sidebar(): React.JSX.Element {
  const filter = useNoteStore((state) => state.filter);
  const setFilter = useNoteStore((state) => state.setFilter);
  const createNote = useNoteStore((state) => state.createNote);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[#E2E5EA] bg-[#F1F3F6]">
      <div className="flex items-center gap-2 px-3.5 pt-3.5 pb-2.5">
        <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#2563EB] to-[#4F7CF7] text-xs font-bold text-white">
          SN
        </div>
        <div className="text-[13.5px] font-semibold tracking-tight text-[#14181F]">StoryNote</div>
      </div>

      <nav className="flex flex-col gap-px px-2 py-0.5">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.filter}
            type="button"
            onClick={() => void setFilter(item.filter)}
            className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] font-medium transition-colors ${
              filter === item.filter
                ? 'bg-[#E8EEFD] text-[#2563EB]'
                : 'text-[#5B6472] hover:bg-[#EBEEF2] hover:text-[#14181F]'
            }`}
          >
            <item.Icon className="h-4 w-4 shrink-0 opacity-85" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="mt-auto flex items-center gap-2 border-t border-[#E2E5EA] p-2.5">
        <button
          type="button"
          onClick={() => void createNote()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[#E2E5EA] px-2 py-1.5 text-xs font-medium text-[#5B6472] transition-colors hover:bg-[#EBEEF2] hover:text-[#14181F]"
        >
          <NewNoteIcon className="h-3.5 w-3.5" />
          New note
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
