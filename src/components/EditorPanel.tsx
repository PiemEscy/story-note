import { useCallback, useEffect, useRef, useState } from 'react';
import { useNoteStore } from '../store/useNoteStore';
import type { PublicNoteRow } from '../services/notesService';
import { formatShortDate, formatRelativeTime } from '../utils/formatDate';
import { useNoteEditor } from '../editor/useNoteEditor';
import EditorToolbar from '../editor/EditorToolbar';
import NoteEditor from '../editor/NoteEditor';
import ConfirmDialog from './ConfirmDialog';
import { MoreOptionsIcon, ArchivedIcon, ExportIcon, DeleteIcon } from './icons';

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

  const [title, setTitle] = useState(note.title);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

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
    <section className="flex min-w-0 flex-1 flex-col bg-white">
      <div className="flex items-center gap-2 border-b border-[#E2E5EA] px-4 py-2.5">
        <span className="flex-1" />
        <div className="relative">
          <button
            type="button"
            title="More options"
            onClick={() => setIsMenuOpen((open) => !open)}
            className="flex h-[26px] w-[26px] items-center justify-center rounded text-[#5B6472] transition-colors hover:bg-[#EBEEF2] hover:text-[#14181F]"
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
              <div className="absolute top-8 right-0 z-[200] w-[190px] rounded-lg border border-[#E2E5EA] bg-white p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.18)]">
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    void setArchived(note.id, filter !== 'archived');
                  }}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12.5px] font-medium text-[#5B6472] transition-colors hover:bg-[#EBEEF2] hover:text-[#14181F]"
                >
                  <ArchivedIcon className="h-3.5 w-3.5 opacity-80" />
                  {filter === 'archived' ? 'Unarchive' : 'Archive'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    void exportNote(note.id);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12.5px] font-medium text-[#5B6472] transition-colors hover:bg-[#EBEEF2] hover:text-[#14181F]"
                >
                  <ExportIcon className="h-3.5 w-3.5 opacity-80" />
                  Export as .TXT
                </button>
                <div className="my-1 h-px bg-[#E2E5EA]" />
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

      {editor && <EditorToolbar editor={editor} />}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-10 py-8">
          <input
            value={title}
            onChange={(event) => handleTitleChange(event.target.value)}
            placeholder="Untitled"
            className="mb-1.5 w-full border-0 text-[26px] font-bold tracking-tight text-[#14181F] outline-none placeholder:text-[#8992A0]"
          />
          <div className="mb-5 font-mono text-[11.5px] text-[#8992A0]">
            Created {formatShortDate(note.created_at)} · Modified{' '}
            {formatRelativeTime(note.updated_at)}
          </div>
          <NoteEditor editor={editor} />
        </div>
      </div>

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

function EditorPanel(): React.JSX.Element {
  const notes = useNoteStore((state) => state.notes);
  const activeNoteId = useNoteStore((state) => state.activeNoteId);
  const filter = useNoteStore((state) => state.filter);

  const activeNote = notes.find((note) => note.id === activeNoteId) ?? null;

  if (filter === 'trash') {
    return (
      <section className="flex flex-1 items-center justify-center bg-white text-center text-[#8992A0]">
        <p className="max-w-[260px] text-[12.5px]">
          Trashed notes can be restored or permanently deleted from the list — select an action
          there.
        </p>
      </section>
    );
  }

  if (!activeNote) {
    return (
      <section className="flex flex-1 items-center justify-center bg-white text-center text-[#8992A0]">
        <p className="max-w-[260px] text-[12.5px]">
          Select a note to view it here, or create a new one.
        </p>
      </section>
    );
  }

  return <NoteEditorForm key={activeNote.id} note={activeNote} filter={filter} />;
}

export default EditorPanel;
