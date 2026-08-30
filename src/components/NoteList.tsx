import { useState } from 'react';
import { useNoteStore } from '../store/useNoteStore';
import type { PublicNoteRow } from '../services/notesService';
import { formatRelativeTime } from '../utils/formatDate';
import ConfirmDialog from './ConfirmDialog';
import { NewNoteIcon } from './icons';

const FILTER_TITLES: Record<string, string> = {
  active: 'All Notes',
  archived: 'Archived',
  trash: 'Trash',
};

function previewText(note: PublicNoteRow): string {
  if (note.is_locked) return 'Locked note — content hidden';
  return note.content_plain.trim() || 'No additional text';
}

function NoteList(): React.JSX.Element {
  const notes = useNoteStore((state) => state.notes);
  const filter = useNoteStore((state) => state.filter);
  const activeNoteId = useNoteStore((state) => state.activeNoteId);
  const isLoading = useNoteStore((state) => state.isLoading);
  const selectNote = useNoteStore((state) => state.selectNote);
  const createNote = useNoteStore((state) => state.createNote);
  const restoreNote = useNoteStore((state) => state.restoreNote);
  const purgeNote = useNoteStore((state) => state.purgeNote);

  const [pendingPurgeId, setPendingPurgeId] = useState<number | null>(null);

  return (
    <section className="flex w-80 shrink-0 flex-col border-r border-[#E2E5EA] bg-[#F7F8FA]">
      <div className="flex items-center gap-2 border-b border-[#E2E5EA] bg-white px-3.5 py-3">
        <h2 className="m-0 text-sm font-semibold tracking-tight text-[#14181F]">
          {FILTER_TITLES[filter]}
        </h2>
        <span className="flex-1" />
        {filter === 'active' && (
          <button
            type="button"
            title="New note"
            onClick={() => void createNote()}
            className="flex h-[26px] w-[26px] items-center justify-center rounded text-[#5B6472] transition-colors hover:bg-[#EBEEF2] hover:text-[#14181F]"
          >
            <NewNoteIcon className="h-[15px] w-[15px]" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-1.5">
        {isLoading && notes.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-[#8992A0]">Loading…</p>
        )}

        {!isLoading && notes.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-5 py-12 text-center text-[#8992A0]">
            <h3 className="m-0 text-[13.5px] font-semibold text-[#5B6472]">
              {filter === 'trash' ? 'Trash is empty' : 'No notes yet'}
            </h3>
            <p className="m-0 max-w-[220px] text-xs">
              {filter === 'active'
                ? 'Create your first note to start capturing ideas.'
                : filter === 'archived'
                  ? 'Archived notes will show up here.'
                  : 'Deleted notes will show up here.'}
            </p>
          </div>
        )}

        {notes.map((note) =>
          filter === 'trash' ? (
            <div
              key={note.id}
              className="flex items-start gap-2 rounded-md border border-transparent p-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-[#14181F]">
                  {note.title || 'Untitled'}
                </div>
                <div className="mt-1 font-mono text-[10.5px] text-[#8992A0]">
                  Deleted {formatRelativeTime(note.deleted_at ?? note.updated_at)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void restoreNote(note.id)}
                className="shrink-0 rounded border border-[#E2E5EA] px-2 py-1 text-[11px] font-medium text-[#5B6472] transition-colors hover:bg-[#EBEEF2] hover:text-[#14181F]"
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
          ) : (
            <button
              key={note.id}
              type="button"
              onClick={() => selectNote(note.id)}
              className={`flex w-full items-start gap-2.5 rounded-md border p-2.5 text-left transition-colors ${
                activeNoteId === note.id
                  ? 'border-[rgba(37,99,235,0.25)] bg-[#E8EEFD]'
                  : 'border-transparent hover:bg-[#EBEEF2]'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-[#14181F]">
                  {note.title || 'Untitled'}
                </div>
                <div className="mt-0.5 truncate text-xs text-[#8992A0]">{previewText(note)}</div>
                <div className="mt-1 font-mono text-[10.5px] text-[#8992A0]">
                  Modified {formatRelativeTime(note.updated_at)}
                </div>
              </div>
            </button>
          ),
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
