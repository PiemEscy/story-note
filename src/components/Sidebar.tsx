import { useEffect, useRef, useState } from 'react';
import { useNoteStore } from '../store/useNoteStore';
import type { NoteFilter } from '../store/useNoteStore';
import { useLabelStore, resolveLabelColor } from '../store/useLabelStore';
import type { LabelRow } from '../services/labelsService';
import { useUIStore, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH } from '../store/useUIStore';
import type { ThemeMode } from '../store/useUIStore';
import {
  AllNotesIcon,
  ArchivedIcon,
  TrashNavIcon,
  NewNoteIcon,
  SunIcon,
  MoonIcon,
  EditIcon,
  SearchIcon,
  CompactIcon,
} from './icons';
import LabelModal from './LabelModal';

const THEME_CYCLE: Record<ThemeMode, ThemeMode> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};
const THEME_LABEL: Record<ThemeMode, string> = { system: 'System', light: 'Light', dark: 'Dark' };

// Pinned/Locked nav items from the UI reference are deliberately omitted
// here — pin (Phase 9) and lock (Phase 8) are both implemented now, but
// neither phase's own checklist ever called for a dedicated Sidebar filter
// for them (unlike "Pinned"/"Locked" as counts in the reference), so adding
// one now would be UI with no requirement behind it, not "finishing" either
// phase.
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
  const searchQuery = useNoteStore((state) => state.searchQuery);
  const search = useNoteStore((state) => state.search);
  const labels = useLabelStore((state) => state.labels);
  const theme = useUIStore((state) => state.theme);
  const resolvedTheme = useUIStore((state) => state.resolvedTheme);
  const setTheme = useUIStore((state) => state.setTheme);
  const compactMode = useUIStore((state) => state.compactMode);
  const setCompactMode = useUIStore((state) => state.setCompactMode);
  const sidebarWidth = useUIStore((state) => state.sidebarWidth);
  const setSidebarWidth = useUIStore((state) => state.setSidebarWidth);

  // 'new' opens the modal in create mode; a LabelRow opens it pre-filled for
  // editing (with a delete option); null keeps it closed.
  const [editingLabel, setEditingLabel] = useState<LabelRow | 'new' | null>(null);

  // "Accessible from anywhere" (Phase 7): Sidebar is always mounted
  // regardless of filter/view, so a persistent search box here already
  // satisfies that on its own — this just adds the reference's Ctrl/Cmd+K
  // shortcut to jump focus into it from wherever the user's cursor is.
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Phase 10's global Ctrl+Shift+F shortcut (electron/shortcuts.ts) — fires
  // even when the window wasn't focused, so it also needs to bring the
  // window forward (handled main-process-side before this ever fires) and
  // then land focus here, same as the in-app Ctrl+K above.
  useEffect(() => {
    return window.storyNoteAPI.shortcuts.onTrigger((action) => {
      if (action === 'focus-search') searchInputRef.current?.focus();
    });
  }, []);

  // storynote-ui-reference.html's .sidebar-resize-handle — a drag-to-resize
  // handle on the sidebar's right edge. `dragWidth` (not the store's
  // sidebarWidth directly) tracks the live value while dragging so every
  // mousemove doesn't also fire a settingsService.set() IPC call; only
  // mouseup calls setSidebarWidth() to actually persist the final value —
  // same "don't spam IPC on every intermediate frame" reasoning as
  // electron/main.ts's debounced window-bounds save.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const handleResizeStart = (event: React.MouseEvent): void => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent): void => {
      const next = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, startWidth + (moveEvent.clientX - startX)),
      );
      setDragWidth(next);
    };
    const handleMouseUp = (upEvent: MouseEvent): void => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      const finalWidth = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, startWidth + (upEvent.clientX - startX)),
      );
      setSidebarWidth(finalWidth);
      setDragWidth(null);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    // storynote-ui-reference.html's .sidebar targets 240px but only sets
    // min-width:180px (no flex-shrink override, so it's shrinkable by
    // default) — this used to be shrink-0 (permanently rigid 240px), which
    // combined with NoteList.tsx's own rigid Sidebar-view width meant a
    // narrow window just clipped content past the edge instead of
    // reflowing, since neither pane could give up any space at all. Width is
    // now the user's resized value (dragWidth while actively dragging,
    // sidebarWidth otherwise) rather than a fixed w-60 — `shrink` is kept so
    // the flex algorithm can still shrink it below that chosen width down to
    // min-w-[180px] at a narrow window width, same as before.
    <aside
      className="relative flex min-w-[180px] shrink flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)]"
      style={{ width: dragWidth ?? sidebarWidth }}
    >
      <div
        role="presentation"
        title="Resizable sidebar"
        onMouseDown={handleResizeStart}
        className="absolute top-0 -right-[3px] z-[5] h-full w-1.5 cursor-col-resize"
      />
      <div className="flex items-center gap-2 px-3.5 pt-3.5 pb-2.5">
        <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[var(--accent)] to-[#4F7CF7] text-xs font-bold text-white">
          SN
        </div>
        <div className="text-[13.5px] font-semibold tracking-tight text-[var(--text-primary)]">
          StoryNote
        </div>
      </div>

      <div className="mx-3 mb-2.5 flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 transition-colors focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
        <SearchIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(event) => void search(event.target.value)}
          placeholder="Search notes…"
          className="w-full min-w-0 border-0 bg-transparent text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
        />
        <span className="shrink-0 rounded border border-[var(--border)] bg-[var(--bg-hover)] px-1 py-px font-mono text-[10px] text-[var(--text-tertiary)]">
          Ctrl K
        </span>
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
          title={
            compactMode
              ? 'Compact mode: on (click to turn off)'
              : 'Compact mode: off (click to turn on)'
          }
          onClick={() => setCompactMode(!compactMode)}
          className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border transition-colors hover:bg-[var(--bg-hover)] ${
            compactMode
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <CompactIcon className="h-3.5 w-3.5" />
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
