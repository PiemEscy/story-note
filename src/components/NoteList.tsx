import { useState } from 'react';
import { useNoteStore } from '../store/useNoteStore';
import { useLabelStore } from '../store/useLabelStore';
import { useUIStore } from '../store/useUIStore';
import type { ViewMode } from '../store/useUIStore';
import type { NoteSortField, SortDirection } from '../../electron/db/notes';
import { formatRelativeTime } from '../utils/formatDate';
import ConfirmDialog from './ConfirmDialog';
import {
  NewNoteIcon,
  SidebarViewIcon,
  ListViewIcon,
  TableIcon,
  GridViewIcon,
  LargeGridViewIcon,
} from './icons';
import NoteListRows from '../views/NoteListRows';
import NoteDetailsTable from '../views/NoteDetailsTable';
import NoteGridCards from '../views/NoteGridCards';

const FILTER_TITLES: Record<string, string> = {
  active: 'All Notes',
  archived: 'Archived',
  trash: 'Trash',
};

// Cycles sidebar -> list -> details -> grid -> largegrid -> sidebar, one
// click at a time — same pattern as Sidebar.tsx's theme toggle (a single
// icon button showing the current state, click to advance).
const VIEW_CYCLE: Record<ViewMode, ViewMode> = {
  sidebar: 'list',
  list: 'details',
  details: 'grid',
  grid: 'largegrid',
  largegrid: 'sidebar',
};

const VIEW_LABEL: Record<ViewMode, string> = {
  sidebar: 'Sidebar',
  list: 'List',
  details: 'Details',
  grid: 'Grid',
  largegrid: 'Large Grid',
};

const VIEW_ICON: Record<ViewMode, typeof SidebarViewIcon> = {
  sidebar: SidebarViewIcon,
  list: ListViewIcon,
  details: TableIcon,
  grid: GridViewIcon,
  largegrid: LargeGridViewIcon,
};

// storynote-ui-reference.html's .sort-select — option order/labels matched
// exactly. No direction control shown there (or anywhere in the reference),
// so each field gets a sensible default direction instead of exposing its
// own asc/desc toggle: newest-first for dates, A-Z for text — matching what
// most note apps do without needing a second control.
const SORT_OPTIONS: { field: NoteSortField; label: string; direction: SortDirection }[] = [
  { field: 'updated_at', label: 'Date modified', direction: 'desc' },
  { field: 'created_at', label: 'Date created', direction: 'desc' },
  { field: 'title', label: 'Title', direction: 'asc' },
  { field: 'label', label: 'Label', direction: 'asc' },
];

function NoteList(): React.JSX.Element | null {
  const notes = useNoteStore((state) => state.notes);
  const filter = useNoteStore((state) => state.filter);
  const labelFilter = useNoteStore((state) => state.labelFilter);
  const searchQuery = useNoteStore((state) => state.searchQuery);
  const searchResults = useNoteStore((state) => state.searchResults);
  const unlockedNoteIds = useNoteStore((state) => state.unlockedNoteIds);
  const sortBy = useNoteStore((state) => state.sortBy);
  const setSort = useNoteStore((state) => state.setSort);
  const activeNoteId = useNoteStore((state) => state.activeNoteId);
  const isLoading = useNoteStore((state) => state.isLoading);
  const selectNote = useNoteStore((state) => state.selectNote);
  const createNote = useNoteStore((state) => state.createNote);
  const restoreNote = useNoteStore((state) => state.restoreNote);
  const purgeNote = useNoteStore((state) => state.purgeNote);
  const labels = useLabelStore((state) => state.labels);
  const view = useUIStore((state) => state.view);
  const setView = useUIStore((state) => state.setView);
  const isNoteDetailOpen = useUIStore((state) => state.isNoteDetailOpen);
  const openNoteDetail = useUIStore((state) => state.openNoteDetail);

  const [pendingPurgeId, setPendingPurgeId] = useState<number | null>(null);

  const isSearching = searchQuery.trim() !== '';

  // Trash always keeps its own dedicated Restore/Delete-forever row UI (it
  // doesn't fit the list/table/card metaphors the other views use — there's
  // nothing in storynote-ui-reference.html for "Trash, but as a grid"), so
  // it's treated as the Sidebar layout regardless of whatever view is
  // selected elsewhere. A search in progress bypasses that — search results
  // never include trashed notes (searchNotes() excludes deleted_at), so
  // there's nothing for the trash-only UI to show even if `filter` still
  // happens to be 'trash' underneath an active query.
  const effectiveView: ViewMode = filter === 'trash' && !isSearching ? 'sidebar' : view;
  const isWideView = effectiveView !== 'sidebar';

  // List/Details/Grid/Large Grid have no inline list-alongside-editor
  // layout — opening a note there used to force `view` back to 'sidebar'
  // (silently overwriting the user's actual view preference just from
  // selecting a note). Instead, the listing hides and EditorPanel.tsx shows
  // the note full-screen with a Back button, leaving `view` untouched.
  // activeNoteId !== null guards against isNoteDetailOpen staying stale-true
  // for a moment after a filter switch clears the active note.
  const isNoteOpenFullScreen =
    filter !== 'trash' && view !== 'sidebar' && isNoteDetailOpen && activeNoteId !== null;

  const handleSelect = (id: number): void => {
    selectNote(id);
    openNoteDetail();
  };

  const ViewIcon = VIEW_ICON[view];

  // Sidebar's Labels section filters the 'active' list down to one label,
  // client-side — the notes for 'active' are already fetched in full, so
  // this doesn't need its own IPC/query support. A search query takes over
  // the pane entirely, cutting across whatever filter/label was selected —
  // same precedence the Sidebar's search input has over nav/label clicks
  // (see useNoteStore's setFilter/setLabelFilter, which clear searchQuery).
  const displayedNotes = isSearching
    ? searchResults
    : labelFilter !== null
      ? notes.filter((note) => note.label_id === labelFilter)
      : notes;
  const filterLabelName =
    labelFilter !== null
      ? (labels.find((label) => label.id === labelFilter)?.name ?? 'Label')
      : null;

  if (isNoteOpenFullScreen) {
    return null;
  }

  return (
    <section
      className={`flex flex-col border-r border-[var(--border)] bg-[var(--bg-app)] ${
        // shrink-0 unconditionally here previously fought flex-1's implicit
        // flex-shrink:1 in wide-view mode, so the pane could grow but never
        // shrink below its content's natural width — at a narrow window
        // width the row/toolbar content just got silently clipped by
        // App.tsx's overflow-hidden instead of reflowing. min-w-0 overrides
        // the flex item's default min-width:auto, which is what actually
        // lets it shrink below that natural content width.
        //
        // The Sidebar-view branch (w-80) used to be shrink-0 too — matching
        // storynote-ui-reference.html's own note-list-pane, which really is
        // flex-shrink:0 there. Deviates from the reference on purpose here:
        // that rule leaves the reference itself unable to reflow this pane
        // at a narrow width (its min-width:240px is dead code once
        // flex-shrink is 0), which is the exact class of bug being fixed
        // app-wide — min-w-[240px] with shrink actually engages that floor.
        isWideView ? 'w-full min-w-0 flex-1' : 'w-80 min-w-[240px] shrink'
      }`}
    >
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-surface-raised)] px-3.5 py-3">
        <h2 className="m-0 min-w-0 truncate text-sm font-semibold tracking-tight text-[var(--text-primary)]">
          {isSearching
            ? `Search: "${searchQuery.trim()}"`
            : (filterLabelName ?? FILTER_TITLES[filter])}
        </h2>
        <span className="flex-1" />
        {filter === 'active' && !isSearching && (
          <select
            title="Sort by"
            value={sortBy}
            onChange={(event) => {
              const option = SORT_OPTIONS.find(
                (candidate) => candidate.field === event.target.value,
              );
              if (option) void setSort(option.field, option.direction);
            }}
            className="rounded border border-[var(--border)] bg-[var(--bg-hover)] px-1.5 py-1 text-[11.5px] text-[var(--text-secondary)] outline-none"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.field} value={option.field}>
                {option.label}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          title={
            filter === 'trash'
              ? `View: ${VIEW_LABEL[view]} (Trash always shows as Sidebar)`
              : `View: ${VIEW_LABEL[view]} (click to change)`
          }
          disabled={filter === 'trash'}
          onClick={() => setView(VIEW_CYCLE[view])}
          className="flex h-[26px] w-[26px] items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        >
          <ViewIcon className="h-[15px] w-[15px]" />
        </button>
        {filter === 'active' && (
          <button
            type="button"
            title="New note"
            onClick={() => void createNote()}
            className="flex h-[26px] w-[26px] items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <NewNoteIcon className="h-[15px] w-[15px]" />
          </button>
        )}
      </div>

      <div
        className={
          effectiveView === 'details'
            ? 'flex-1 overflow-y-auto'
            : effectiveView === 'grid' || effectiveView === 'largegrid'
              ? `grid flex-1 auto-rows-min gap-2.5 overflow-y-auto p-1.5 ${
                  effectiveView === 'grid'
                    ? 'grid-cols-[repeat(auto-fill,minmax(170px,1fr))]'
                    : 'grid-cols-[repeat(auto-fill,minmax(260px,1fr))]'
                }`
              : 'flex-1 overflow-y-auto p-1.5'
        }
      >
        {isLoading && displayedNotes.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-[var(--text-tertiary)]">Loading…</p>
        )}

        {!isLoading && displayedNotes.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-5 py-12 text-center text-[var(--text-tertiary)]">
            <h3 className="m-0 text-[13.5px] font-semibold text-[var(--text-secondary)]">
              {isSearching ? 'No matches' : filter === 'trash' ? 'Trash is empty' : 'No notes yet'}
            </h3>
            <p className="m-0 max-w-[220px] text-xs">
              {isSearching
                ? 'No notes match your search.'
                : filterLabelName
                  ? 'No notes have this label yet.'
                  : filter === 'active'
                    ? 'Create your first note to start capturing ideas.'
                    : filter === 'archived'
                      ? 'Archived notes will show up here.'
                      : 'Deleted notes will show up here.'}
            </p>
          </div>
        )}

        {!isSearching &&
          filter === 'trash' &&
          displayedNotes.map((note) => (
            <div
              key={note.id}
              className="flex items-start gap-2 rounded-md border border-transparent p-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-[var(--text-primary)]">
                  {note.title || 'Untitled'}
                </div>
                <div className="mt-1 font-mono text-[10.5px] text-[var(--text-tertiary)]">
                  Deleted {formatRelativeTime(note.deleted_at ?? note.updated_at)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void restoreNote(note.id)}
                className="shrink-0 rounded border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                Restore
              </button>
              <button
                type="button"
                onClick={() => setPendingPurgeId(note.id)}
                className="shrink-0 rounded border border-transparent px-2 py-1 text-[11px] font-medium text-[#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.08)]"
              >
                Delete forever
              </button>
            </div>
          ))}

        {(isSearching || filter !== 'trash') &&
          (effectiveView === 'sidebar' || effectiveView === 'list') && (
            <NoteListRows
              notes={displayedNotes}
              activeNoteId={activeNoteId}
              labels={labels}
              unlockedNoteIds={unlockedNoteIds}
              onSelect={handleSelect}
            />
          )}
        {(isSearching || filter !== 'trash') && effectiveView === 'details' && (
          <NoteDetailsTable
            notes={displayedNotes}
            activeNoteId={activeNoteId}
            labels={labels}
            onSelect={handleSelect}
          />
        )}
        {(isSearching || filter !== 'trash') &&
          (effectiveView === 'grid' || effectiveView === 'largegrid') && (
            <NoteGridCards
              notes={displayedNotes}
              activeNoteId={activeNoteId}
              labels={labels}
              unlockedNoteIds={unlockedNoteIds}
              onSelect={handleSelect}
              large={effectiveView === 'largegrid'}
            />
          )}
      </div>

      {pendingPurgeId !== null && (
        <ConfirmDialog
          title="Delete forever?"
          message="This note will be permanently deleted. This action cannot be undone."
          confirmLabel="Delete forever"
          isDanger
          onCancel={() => setPendingPurgeId(null)}
          onConfirm={() => {
            void purgeNote(pendingPurgeId);
            setPendingPurgeId(null);
          }}
        />
      )}
    </section>
  );
}

export default NoteList;
