import { useState } from 'react';
import { useNoteStore } from '../store/useNoteStore';
import type { NoteFilter } from '../store/useNoteStore';
import { useLabelStore, resolveLabelColor } from '../store/useLabelStore';
import type { LabelRow } from '../services/labelsService';
import { useUIStore } from '../store/useUIStore';
import type { ThemeMode } from '../store/useUIStore';
import {
  AllNotesIcon,
  ArchivedIcon,
  TrashNavIcon,
  NewNoteIcon,
  SunIcon,
  MoonIcon,
  EditIcon,
} from './icons';
import LabelModal from './LabelModal';

const THEME_CYCLE: Record<ThemeMode, ThemeMode> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};
const THEME_LABEL: Record<ThemeMode, string> = { system: 'System', light: 'Light', dark: 'Dark' };

// Pinned/Locked nav items from the UI reference are deliberately omitted
// here — they belong to Phase 9 (pin) and Phase 8 (lock), neither of which
// exists yet. Rendering them now would be dead UI (code-style.md: no
// half-finished implementations).
const NAV_ITEMS: {
  filter: NoteFilter;
  label: string;
  Icon: typeof AllNotesIcon;
  countKey: 'active' | 'archived' | 'trash';
}[] = [
  { filter: 'active', label: 'All Notes', Icon: AllNotesIcon, countKey: 'active' },
  { filter: 'archived', label: 'Archived', Icon: ArchivedIcon, countKey: 'archived' },
  { filter: 'trash', label: 'Trash', Icon: TrashNavIcon, countKey: 'trash' },
];

function Sidebar(): React.JSX.Element {
  const filter = useNoteStore((state) => state.filter);
  const setFilter = useNoteStore((state) => state.setFilter);
  const labelFilter = useNoteStore((state) => state.labelFilter);
  const setLabelFilter = useNoteStore((state) => state.setLabelFilter);
  const noteCounts = useNoteStore((state) => state.noteCounts);
  const createNote = useNoteStore((state) => state.createNote);
  const labels = useLabelStore((state) => state.labels);
  const theme = useUIStore((state) => state.theme);
  const resolvedTheme = useUIStore((state) => state.resolvedTheme);
  const setTheme = useUIStore((state) => state.setTheme);

  // 'new' opens the modal in create mode; a LabelRow opens it pre-filled for
  // editing (with a delete option); null keeps it closed.
  const [editingLabel, setEditingLabel] = useState<LabelRow | 'new' | null>(null);

  return (
    // storynote-ui-reference.html's .sidebar targets 240px but only sets
    // min-width:180px (no flex-shrink override, so it's shrinkable by
    // default) — this used to be shrink-0 (permanently rigid 240px), which
    // combined with NoteList.tsx's own rigid Sidebar-view width meant a
    // narrow window just clipped content past the edge instead of
    // reflowing, since neither pane could give up any space at all.
    <aside className="flex w-60 min-w-[180px] shrink flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)]">
      <div className="flex items-center gap-2 px-3.5 pt-3.5 pb-2.5">
        <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[var(--accent)] to-[#4F7CF7] text-xs font-bold text-white">
          SN
        </div>
        <div className="text-[13.5px] font-semibold tracking-tight text-[var(--text-primary)]">
          StoryNote
        </div>
      </div>

      <nav className="flex flex-col gap-px px-2 py-0.5">
        {NAV_ITEMS.map((item) => {
          // labelFilter === null: a label being selected takes over the
          // "active" highlight below — All Notes shouldn't also look
          // selected at the same time as a label.
          const isActive = filter === item.filter && labelFilter === null;
          return (
            <button
              key={item.filter}
              type="button"
              onClick={() => void setFilter(item.filter)}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] font-medium transition-colors ${
                isActive
                  ? 'bg-[var(--bg-active)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <item.Icon className="h-4 w-4 shrink-0 opacity-85" />
              {item.label}
              {noteCounts && (
                <span
                  className={`ml-auto shrink-0 font-mono text-[11px] ${
                    isActive ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'
                  }`}
                >
                  {noteCounts[item.countKey]}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-3 pt-3.5 pb-1.5 text-[11px] font-semibold tracking-wide text-[var(--text-tertiary)] uppercase">
        Labels
      </div>
      <div className="flex flex-col gap-px px-2 pb-1">
        {labels.map((label) => {
          const isActive = labelFilter === label.id;
          return (
            <div
              key={label.id}
              // px-2 py-1.5 lives here now, not on the inner filter button —
              // so this row's right edge matches the nav items' above
              // exactly, and the count (last child, shrink-0) always lands
              // on that same right-aligned column regardless of whether the
              // edit icon before it is visible. Previously the edit-icon
              // button was a sibling *after* the count (inside the filter
              // button's own padding), which pushed the count left of the
              // nav items' column by the icon button's width.
              className={`group flex items-center gap-2 rounded px-2 py-1.5 transition-colors ${
                isActive
                  ? 'bg-[var(--bg-active)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              {/* Clicking the label filters the note list to it — same
                  interaction pattern as All Notes/Archived/Trash above.
                  Editing moved to the separate pencil button below (a
                  sibling, not nested — two <button>s can't nest), since a
                  single click target can't mean both "filter" and "open the
                  edit modal" at once. */}
              <button
                type="button"
                onClick={() => void setLabelFilter(label.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-[12.5px] font-medium"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: resolveLabelColor(label.color) }}
                />
                <span className="truncate">{label.name}</span>
              </button>
              <button
                type="button"
                title="Edit label"
                onClick={() => setEditingLabel(label)}
                // focus-visible:opacity-100 alongside group-hover:opacity-100:
                // without it, tabbing to this button with a keyboard focuses
                // an invisible (opacity-0) element — reachable, but with no
                // visible focus indicator unless the row also happens to be
                // hovered.
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:opacity-100"
              >
                <EditIcon className="h-3 w-3" />
              </button>
              {noteCounts && (
                <span
                  className={`shrink-0 font-mono text-[11px] ${
                    isActive ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'
                  }`}
                >
                  {noteCounts.byLabel[label.id] ?? 0}
                </span>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setEditingLabel('new')}
          className="rounded px-2 py-1.5 text-left text-[12.5px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
        >
          + New label
        </button>
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-[var(--border)] p-2.5">
        <button
          type="button"
          title={`Theme: ${THEME_LABEL[theme]} (click to change)`}
          onClick={() => setTheme(THEME_CYCLE[theme])}
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          {resolvedTheme === 'dark' ? (
            <MoonIcon className="h-3.5 w-3.5" />
          ) : (
            <SunIcon className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => void createNote()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <NewNoteIcon className="h-3.5 w-3.5" />
          New note
        </button>
      </div>

      {editingLabel !== null && (
        <LabelModal
          label={editingLabel === 'new' ? null : editingLabel}
          onClose={() => setEditingLabel(null)}
        />
      )}
    </aside>
  );
}

export default Sidebar;
