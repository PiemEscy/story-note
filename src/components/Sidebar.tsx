import { useCallback, useEffect, useRef, useState } from 'react';
import { useNoteStore } from '../store/useNoteStore';
import type { NoteFilter } from '../store/useNoteStore';
import { useLabelStore, resolveLabelColor } from '../store/useLabelStore';
import type { LabelRow } from '../services/labelsService';
import {
  useUIStore,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_COLLAPSED_WIDTH,
} from '../store/useUIStore';
import {
  AllNotesIcon,
  ArchivedIcon,
  TrashNavIcon,
  NewNoteIcon,
  ImportIcon,
  EditIcon,
  SearchIcon,
  SettingsIcon,
  SidebarCollapseIcon,
  SidebarExpandIcon,
} from './icons';
import LabelModal from './LabelModal';
import SettingsModal from './SettingsModal';

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
  const importNotes = useNoteStore((state) => state.importNotes);
  const searchQuery = useNoteStore((state) => state.searchQuery);
  const search = useNoteStore((state) => state.search);
  const labels = useLabelStore((state) => state.labels);
  const sidebarWidth = useUIStore((state) => state.sidebarWidth);
  const setSidebarWidth = useUIStore((state) => state.setSidebarWidth);
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);

  // 'new' opens the modal in create mode; a LabelRow opens it pre-filled for
  // editing (with a delete option); null keeps it closed.
  const [editingLabel, setEditingLabel] = useState<LabelRow | 'new' | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // "Accessible from anywhere" (Phase 7): Sidebar is always mounted
  // regardless of filter/view, so a persistent search box here already
  // satisfies that on its own — this just adds the reference's Ctrl/Cmd+K
  // shortcut to jump focus into it from wherever the user's cursor is.
  const searchInputRef = useRef<HTMLInputElement>(null);

  // The search input doesn't exist in the DOM while collapsed (only an
  // icon button does) — expanding is an async state update, so a ref
  // focus() call made in the same handler would run before the input has
  // actually mounted. This flag defers the focus to the effect below, which
  // fires once the expand has actually rendered.
  const pendingSearchFocus = useRef(false);
  useEffect(() => {
    if (!sidebarCollapsed && pendingSearchFocus.current) {
      pendingSearchFocus.current = false;
      searchInputRef.current?.focus();
    }
  }, [sidebarCollapsed]);

  const focusSearch = useCallback((): void => {
    if (sidebarCollapsed) {
      pendingSearchFocus.current = true;
      setSidebarCollapsed(false);
    } else {
      searchInputRef.current?.focus();
    }
  }, [sidebarCollapsed, setSidebarCollapsed]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        focusSearch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusSearch]);

  // Phase 10's global Ctrl+Shift+F shortcut (electron/shortcuts.ts) — fires
  // even when the window wasn't focused, so it also needs to bring the
  // window forward (handled main-process-side before this ever fires) and
  // then land focus here, same as the in-app Ctrl+K above. Also expands the
  // sidebar first if it's collapsed, same as clicking the collapsed
  // search icon does.
  useEffect(() => {
    return window.storyNoteAPI.shortcuts.onTrigger((action) => {
      if (action === 'focus-search') focusSearch();
    });
  }, [focusSearch]);

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
    // sidebarCollapsed's fixed icon-rail width, or sidebarWidth otherwise)
    // rather than a fixed w-60 — `shrink` is kept so the flex algorithm can
    // still shrink it below that chosen width down to min-w-[180px] (or the
    // collapsed width) at a narrow window width, same as before. The width
    // transition is suppressed while actively dragging (dragWidth !== null)
    // so it doesn't visibly lag behind the mouse — only the collapse/expand
    // toggle (never concurrent with a drag) actually animates.
    <aside
      className={`relative flex shrink flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)] ${
        sidebarCollapsed ? 'min-w-0' : 'min-w-[180px]'
      } ${dragWidth === null ? 'transition-[width] duration-200 ease-out' : ''}`}
      style={{ width: dragWidth ?? (sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth) }}
    >
      {!sidebarCollapsed && (
        <div
          role="presentation"
          title="Resizable sidebar"
          onMouseDown={handleResizeStart}
          className="absolute top-0 -right-[3px] z-[5] h-full w-1.5 cursor-col-resize"
        />
      )}
      <div className="flex items-center justify-end border-b border-[var(--border)] px-2.5 py-2">
        <button
          type="button"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          {sidebarCollapsed ? (
            <SidebarExpandIcon className="h-4 w-4" />
          ) : (
            <SidebarCollapseIcon className="h-4 w-4" />
          )}
        </button>
      </div>

      {sidebarCollapsed ? (
        <div className="flex justify-center px-2 py-2.5">
          <button
            type="button"
            title="Search notes"
            onClick={focusSearch}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <SearchIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="mx-3 mb-2.5 flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 mt-2 transition-colors focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
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
      )}

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
              title={sidebarCollapsed ? item.label : undefined}
              onClick={() => void setFilter(item.filter)}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] font-medium transition-colors ${
                sidebarCollapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'bg-[var(--bg-active)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <item.Icon className="h-4 w-4 shrink-0 opacity-85" />
              {!sidebarCollapsed && (
                <>
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
                </>
              )}
            </button>
          );
        })}
      </nav>

      {!sidebarCollapsed && (
        <div className="px-3 pt-3.5 pb-1.5 text-[11px] font-semibold tracking-wide text-[var(--text-tertiary)] uppercase">
          Labels
        </div>
      )}
      <div
        className={`flex flex-col gap-px px-2 pb-1 ${sidebarCollapsed ? 'items-center pt-2' : ''}`}
      >
        {labels.map((label) => {
          const isActive = labelFilter === label.id;

          // Collapsed: just the color dot, centered — the label's own
          // "icon" — kept clickable (filters the same as the expanded row)
          // rather than dropped along with the text. No edit button here;
          // editing stays reachable by expanding first, same as it's not
          // reachable from the nav-item icons above either.
          if (sidebarCollapsed) {
            return (
              <button
                key={label.id}
                type="button"
                title={label.name}
                onClick={() => void setLabelFilter(label.id)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
                  isActive ? 'bg-[var(--bg-active)]' : 'hover:bg-[var(--bg-hover)]'
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: resolveLabelColor(label.color) }}
                />
              </button>
            );
          }

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
        {!sidebarCollapsed && (
          <button
            type="button"
            onClick={() => setEditingLabel('new')}
            className="rounded px-2 py-1.5 text-left text-[12.5px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
          >
            + New label
          </button>
        )}
      </div>

      <div
        className={`mt-auto flex items-center gap-2 border-t border-[var(--border)] p-2.5 ${
          sidebarCollapsed ? 'flex-col' : ''
        }`}
      >
        <button
          type="button"
          title="Settings"
          onClick={() => setIsSettingsOpen(true)}
          className={`flex items-center justify-center gap-1.5 rounded-md border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
            sidebarCollapsed ? 'h-8 w-8 shrink-0' : 'flex-1 px-2 py-1.5'
          }`}
        >
          <SettingsIcon className="h-3.5 w-3.5" />
          {!sidebarCollapsed && 'Settings'}
        </button>
        <button
          type="button"
          title="New note"
          onClick={() => void createNote()}
          className={`flex items-center justify-center gap-1.5 rounded-md border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
            sidebarCollapsed ? 'h-8 w-8 shrink-0' : 'flex-1 px-2 py-1.5'
          }`}
        >
          <NewNoteIcon className="h-3.5 w-3.5" />
          {!sidebarCollapsed && 'New note'}
        </button>
        <button
          type="button"
          title="Import .txt file"
          onClick={() => void importNotes()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <ImportIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {editingLabel !== null && (
        <LabelModal
          label={editingLabel === 'new' ? null : editingLabel}
          onClose={() => setEditingLabel(null)}
        />
      )}

      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
    </aside>
  );
}

export default Sidebar;
