import { useCallback, useEffect, useRef, useState } from 'react';
import { useNoteStore } from '../store/useNoteStore';
import type { PublicNoteRow } from '../services/notesService';
import { useLabelStore, resolveLabelColor } from '../store/useLabelStore';
import { useUIStore } from '../store/useUIStore';
import { formatShortDate, formatRelativeTime } from '../utils/formatDate';
import { useNoteEditor } from '../editor/useNoteEditor';
import EditorToolbar from '../editor/EditorToolbar';
import NoteEditor from '../editor/NoteEditor';
import ConfirmDialog from './ConfirmDialog';
import LockedNotePanel from './LockedNotePanel';
import LockNoteModal from './LockNoteModal';
import { MoreOptionsIcon, ArchivedIcon, ExportIcon, DeleteIcon, BackIcon, LockIcon } from './icons';

const AUTOSAVE_DELAY_MS = 600;

interface NoteEditorFormProps {
  note: PublicNoteRow;
  filter: string;
}

// Keyed by note.id from the parent (see EditorPanel below) — switching notes
// mounts a fresh instance of this component, so title/content naturally
// re-initialize from the new note without an effect syncing state from a
// prop change (react-hooks/set-state-in-effect; see
// https://react.dev/learn/you-might-not-need-an-effect).
function NoteEditorForm({ note, filter }: NoteEditorFormProps): React.JSX.Element {
  const updateNote = useNoteStore((state) => state.updateNote);
  const deleteNote = useNoteStore((state) => state.deleteNote);
  const setArchived = useNoteStore((state) => state.setArchived);
  const exportNote = useNoteStore((state) => state.exportNote);
  const assignLabel = useNoteStore((state) => state.assignLabel);
  const unlockedNoteIds = useNoteStore((state) => state.unlockedNoteIds);
  const labels = useLabelStore((state) => state.labels);
  const view = useUIStore((state) => state.view);
  const closeNoteDetail = useUIStore((state) => state.closeNoteDetail);

  // Locked-and-not-yet-unlocked-this-session: the topbar (label chip, more
  // options) still renders per storynote-ui-reference.html's #lockedPanel
  // toggle, but the formatting toolbar and body swap for LockedNotePanel —
  // there's nothing meaningful to format/edit until unlocked, and note.content
  // is server-redacted to '' anyway (electron/ipc/notesHandlers.ts).
  const isLocked = note.is_locked === 1 && !unlockedNoteIds.has(note.id);

  // List/Details/Grid/Large Grid have no inline list-alongside-editor layout
  // (see EditorPanel's own guard below) — opening a note from one of those
  // views takes over the whole pane instead, so it needs a way back to the
  // listing that doesn't touch the view preference itself (that was the bug:
  // selection used to force `view` to 'sidebar', silently overwriting
  // whatever view the user had actually chosen).
  const showBackButton = filter !== 'trash' && view !== 'sidebar';

  const [title, setTitle] = useState(note.title);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLabelMenuOpen, setIsLabelMenuOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [lockModalMode, setLockModalMode] = useState<'lock' | 'remove' | null>(null);

  const noteLabel = labels.find((label) => label.id === note.label_id) ?? null;

  // Title is React state (a controlled <input>); TipTap's document is not —
  // it manages its own internal ProseMirror state and only reports changes
  // out via onUpdate. Both feed one shared debounced-save mechanism below,
  // tracked through refs (written from event handlers, never during render
  // — react-hooks/refs) rather than a useEffect keyed on [title, content],
  // since "content" here isn't a piece of React state to depend on.
  const titleRef = useRef(note.title);
  const draftRef = useRef({ content: note.content, contentPlain: note.content_plain });
  const savedRef = useRef({
    title: note.title,
    content: note.content,
    contentPlain: note.content_plain,
  });
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Autosave (FR-1.2) — debounces edits, then persists. Also used directly
  // (bypassing the timer) by the unmount-flush effect below, so switching
  // notes mid-debounce can't silently discard an edit the way it did before
  // this was fixed (see development-plan.md Phase 3's "Code review findings").
  const scheduleSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const current = { title: titleRef.current, ...draftRef.current };
      if (
        current.title === savedRef.current.title &&
        current.content === savedRef.current.content
      ) {
        return;
      }
      void updateNote(note.id, current).then((succeeded) => {
        // Only mark as saved once the IPC call actually succeeded —
        // otherwise a failed save would look identical to "nothing to
        // flush" to the unmount-flush effect below, permanently losing the
        // edit if the user switches notes or closes the app right after,
        // without typing anything further (a code review caught this).
        if (succeeded) {
          savedRef.current = current;
        }
      });
    }, AUTOSAVE_DELAY_MS);
  }, [note.id, updateNote]);

  const handleTitleChange = (value: string): void => {
    setTitle(value);
    titleRef.current = value;
    scheduleSave();
  };

  const handleEditorUpdate = useCallback(
    (content: string, contentPlain: string) => {
      draftRef.current = { content, contentPlain };
      scheduleSave();
    },
    [scheduleSave],
  );

  const editor = useNoteEditor({ content: note.content, onUpdate: handleEditorUpdate });

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      const current = { title: titleRef.current, ...draftRef.current };
      if (
        current.title === savedRef.current.title &&
        current.content === savedRef.current.content
      ) {
        return;
      }
      void updateNote(note.id, current);
    };
  }, [note.id, updateNote]);

  return (
    // min-w-[300px], not min-w-0: flex-1 (flex-basis:0%) means this pane
    // gets a ZERO scaled shrink factor, so in the CSS flex algorithm's
    // shrinking phase it contributes nothing to absorbing negative space —
    // Sidebar.tsx/NoteList.tsx's siblings (each with their own real
    // min-width floor) absorb 100% of it, and this pane only starts
    // growing again once the container exceeds their combined *natural*
    // widths (560px), not their floors. Below that, this pane computed to
    // literally 0px — invisible, no scrollbar, exactly the class of bug
    // item 4 was about — a code review caught this. min-w-[300px] gives it
    // a genuine floor the flex algorithm has to respect (clamps it up,
    // redistributes the remaining shrink to the other two panes down to
    // their own floors first) instead of 0; electron/main.ts's
    // BrowserWindow minWidth accounts for all three floors combined.
    <section className="flex min-w-[300px] flex-1 flex-col bg-[var(--bg-surface)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
        {showBackButton && (
          <button
            type="button"
            title="Back to list"
            onClick={() => closeNoteDetail()}
            className="flex items-center gap-1 rounded px-2 py-1 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <BackIcon className="h-3.5 w-3.5" />
            Back
          </button>
        )}
        <div className="relative min-w-0">
          <button
            type="button"
            onClick={() => setIsLabelMenuOpen((open) => !open)}
            // min-w-0 + the name in its own truncating span: without them,
            // a long label name at a narrow window width wrapped inside
            // this rounded-full pill instead of staying on one line — as
            // the button grew taller to fit the wrapped text, rounded-full
            // (a border-radius relative to the element's own height)
            // ballooned into a distorted blob shape instead of a chip.
            className="flex min-w-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-hover)] py-1 pr-2.5 pl-1.5 text-[11.5px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                background: noteLabel ? resolveLabelColor(noteLabel.color) : 'var(--text-tertiary)',
              }}
            />
            <span className="truncate">{noteLabel?.name ?? 'Label'}</span>
          </button>
          {isLabelMenuOpen && (
            <>
              <div
                role="presentation"
                className="fixed inset-0 z-[199]"
                onClick={() => setIsLabelMenuOpen(false)}
              />
              <div className="absolute top-8 left-0 z-[200] w-[180px] rounded-lg border border-[var(--border)] bg-[var(--bg-surface-raised)] p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.18)]">
                <button
                  type="button"
                  onClick={() => {
                    setIsLabelMenuOpen(false);
                    void assignLabel(note.id, null);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  No label
                </button>
                {labels.length > 0 && <div className="my-1 h-px bg-[var(--border)]" />}
                {labels.map((label) => (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() => {
                      setIsLabelMenuOpen(false);
                      void assignLabel(note.id, label.id);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: resolveLabelColor(label.color) }}
                    />
                    {label.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <span className="flex-1" />

        <div className="relative">
          <button
            type="button"
            title="More options"
            onClick={() => setIsMenuOpen((open) => !open)}
            className="flex h-[26px] w-[26px] items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <MoreOptionsIcon className="h-[15px] w-[15px]" />
          </button>
          {isMenuOpen && (
            <>
              <div
                role="presentation"
                className="fixed inset-0 z-[199]"
                onClick={() => setIsMenuOpen(false)}
              />
              <div className="absolute top-8 right-0 z-[200] w-[190px] rounded-lg border border-[var(--border)] bg-[var(--bg-surface-raised)] p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.18)]">
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    void setArchived(note.id, filter !== 'archived');
                  }}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  <ArchivedIcon className="h-3.5 w-3.5 opacity-80" />
                  {filter === 'archived' ? 'Unarchive' : 'Archive'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setLockModalMode(note.is_locked === 1 ? 'remove' : 'lock');
                  }}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  <LockIcon className="h-3.5 w-3.5 opacity-80" />
                  {note.is_locked === 1 ? 'Remove lock' : 'Lock note'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    void exportNote(note.id);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  <ExportIcon className="h-3.5 w-3.5 opacity-80" />
                  Export as .TXT
                </button>
                <div className="my-1 h-px bg-[var(--border)]" />
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsConfirmingDelete(true);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12.5px] font-medium text-[#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.08)]"
                >
                  <DeleteIcon className="h-3.5 w-3.5 opacity-80" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {isLocked ? (
        <LockedNotePanel noteId={note.id} noteTitle={note.title} />
      ) : (
        <>
          {editor && <EditorToolbar editor={editor} />}

          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[720px] px-10 py-8">
              <input
                value={title}
                onChange={(event) => handleTitleChange(event.target.value)}
                placeholder="Untitled"
                className="mb-1.5 w-full border-0 text-[26px] font-bold tracking-tight text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
              />
              <div className="mb-5 font-mono text-[11.5px] text-[var(--text-tertiary)]">
                Created {formatShortDate(note.created_at)} · Modified{' '}
                {formatRelativeTime(note.updated_at)}
              </div>
              <NoteEditor editor={editor} />
            </div>
          </div>
        </>
      )}

      {lockModalMode && (
        <LockNoteModal
          noteId={note.id}
          mode={lockModalMode}
          onClose={() => setLockModalMode(null)}
        />
      )}

      {isConfirmingDelete && (
        <ConfirmDialog
          title="Delete this note?"
          message="It will move to Trash, where you can restore it or delete it forever."
          confirmLabel="Delete"
          isDanger
          onCancel={() => setIsConfirmingDelete(false)}
          onConfirm={() => {
            setIsConfirmingDelete(false);
            void deleteNote(note.id);
          }}
        />
      )}
    </section>
  );
}

function EditorPanel(): React.JSX.Element | null {
  const notes = useNoteStore((state) => state.notes);
  const activeNoteId = useNoteStore((state) => state.activeNoteId);
  const filter = useNoteStore((state) => state.filter);
  const unlockedNoteIds = useNoteStore((state) => state.unlockedNoteIds);
  const view = useUIStore((state) => state.view);
  const isNoteDetailOpen = useUIStore((state) => state.isNoteDetailOpen);

  const activeNote = notes.find((note) => note.id === activeNoteId) ?? null;

  // List/Details/Grid/Large Grid hide the editor pane (matching
  // storynote-ui-reference.html's .editor-pane{ display:none } for those
  // data-view values) — except Trash, which keeps the Sidebar layout
  // regardless of the selected view (see NoteList.tsx's effectiveView),
  // and except when a note is actually open: it then takes over the pane
  // full-screen (NoteList.tsx hides the listing for the same condition)
  // instead of forcing `view` back to 'sidebar' the way this used to. Keyed
  // on isNoteDetailOpen rather than activeNoteId — see useUIStore.ts's doc
  // comment on why (activeNoteId can be stale-set from a different view).
  //
  // !activeNote is also required here (a code review caught this): Sidebar
  // nav (All Notes/Archived/Trash) stays mounted even while this pane is
  // hidden, and switching filter while a note was open full-screen clears
  // activeNoteId (useNoteStore's setFilter) without clearing
  // isNoteDetailOpen — without this check, isNoteDetailOpen alone would
  // stay stale-true and this component would fall through to the
  // "Select a note..." placeholder below instead of returning null,
  // rendering a stray flex-1 panel alongside NoteList.tsx's now-visible
  // (and independently correct — see its own activeNoteId !== null guard)
  // full-width listing.
  if (filter !== 'trash' && view !== 'sidebar' && (!isNoteDetailOpen || !activeNote)) {
    return null;
  }

  if (filter === 'trash') {
    return (
      <section className="flex min-w-[300px] flex-1 items-center justify-center bg-[var(--bg-surface)] text-center text-[var(--text-tertiary)]">
        <p className="max-w-[260px] text-[12.5px]">
          Trashed notes can be restored or permanently deleted from the list — select an action
          there.
        </p>
      </section>
    );
  }

  if (!activeNote) {
    return (
      <section className="flex min-w-[300px] flex-1 items-center justify-center bg-[var(--bg-surface)] text-center text-[var(--text-tertiary)]">
        <p className="max-w-[260px] text-[12.5px]">
          Select a note to view it here, or create a new one.
        </p>
      </section>
    );
  }

  // NoteEditorForm's title/content/draft refs only ever initialize once, at
  // mount, from the `note` prop it's given — correct for switching between
  // *different* notes (see its own doc comment), but not by itself enough
  // for the SAME note transitioning from locked-and-redacted to unlocked:
  // without forcing a remount here, the form would stay stuck showing the
  // stale (empty) title/content it mounted with even after unlockNote()
  // replaces this note with its real, unredacted content in the store.
  // Including the unlock state in the key makes that transition remount
  // exactly like switching to a different note.id already does.
  const isUnlocked = unlockedNoteIds.has(activeNote.id);
  return (
    <NoteEditorForm key={`${activeNote.id}:${isUnlocked}`} note={activeNote} filter={filter} />
  );
}

export default EditorPanel;
