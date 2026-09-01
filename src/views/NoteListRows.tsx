import type { PublicNoteRow } from '../services/notesService';
import type { LabelRow } from '../services/labelsService';
import { resolveLabelColor } from '../store/useLabelStore';
import { formatRelativeTime } from '../utils/formatDate';
import { previewText } from '../utils/notePreview';
import { LockIcon, PinIcon } from '../components/icons';

interface NoteListRowsProps {
  notes: PublicNoteRow[];
  activeNoteId: number | null;
  labels: LabelRow[];
  unlockedNoteIds: Set<number>;
  onSelect: (id: number) => void;
}

// The "List" view's row style (storynote-ui-reference.html's .note-list-item)
// — also reused as-is for the "Sidebar" view, which renders identical rows
// in a narrower pane alongside the editor.
function NoteListRows({
  notes,
  activeNoteId,
  labels,
  unlockedNoteIds,
  onSelect,
}: NoteListRowsProps): React.JSX.Element {
  return (
    <>
      {notes.map((note) => {
        const label = labels.find((candidate) => candidate.id === note.label_id);
        const isUnlocked = unlockedNoteIds.has(note.id);

        return (
          <button
            key={note.id}
            type="button"
            onClick={() => onSelect(note.id)}
            className={`flex w-full items-start gap-2.5 rounded-md border p-2.5 text-left transition-colors ${
              activeNoteId === note.id
                ? 'border-[rgba(37,99,235,0.25)] bg-[var(--bg-active)]'
                : 'border-transparent hover:bg-[var(--bg-hover)]'
            }`}
          >
            {note.label_id !== null && (
              <span
                className="mt-[5px] h-2 w-2 shrink-0 rounded-full"
                style={{ background: resolveLabelColor(label?.color) }}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-[var(--text-primary)]">
                {note.is_pinned === 1 && (
                  <PinIcon className="h-[11px] w-[11px] shrink-0 text-[var(--accent)]" />
                )}
                {note.is_locked === 1 && (
                  <LockIcon className="h-[11px] w-[11px] shrink-0 text-[var(--text-tertiary)]" />
                )}
                <span className="truncate">{note.title || 'Untitled'}</span>
              </div>
              <div className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">
                {previewText(note, isUnlocked)}
              </div>
              <div className="mt-1 font-mono text-[10.5px] text-[var(--text-tertiary)]">
                Modified {formatRelativeTime(note.updated_at)}
              </div>
            </div>
          </button>
        );
      })}
    </>
  );
}

export default NoteListRows;
