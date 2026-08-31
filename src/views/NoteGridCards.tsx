import type { PublicNoteRow } from '../services/notesService';
import type { LabelRow } from '../services/labelsService';
import { resolveLabelColor } from '../store/useLabelStore';
import { formatRelativeTime } from '../utils/formatDate';
import { previewText } from '../utils/notePreview';

interface NoteGridCardsProps {
  notes: PublicNoteRow[];
  activeNoteId: number | null;
  labels: LabelRow[];
  onSelect: (id: number) => void;
  // 'largegrid' gives cards more room and a longer preview clamp, matching
  // storynote-ui-reference.html's .app-window[data-view="largegrid"] rule.
  large: boolean;
}

// Matches storynote-ui-reference.html's .note-card — a colored top border
// (--card-accent) is this view's realization of "note accent color derives
// from label color" (Phase 5 covered the list-row label-dot equivalent).
function NoteGridCards({
  notes,
  activeNoteId,
  labels,
  onSelect,
  large,
}: NoteGridCardsProps): React.JSX.Element {
  return (
    <>
      {notes.map((note) => {
        const label = labels.find((candidate) => candidate.id === note.label_id);

        return (
          <button
            key={note.id}
            type="button"
            onClick={() => onSelect(note.id)}
            style={{ borderTopColor: resolveLabelColor(label?.color) }}
            className={`flex flex-col gap-2 rounded-lg border-x border-b border-t-[3px] border-[var(--border)] bg-[var(--bg-surface)] p-3 text-left transition-colors hover:border-[var(--border-strong)] ${
              activeNoteId === note.id ? 'shadow-[0_0_0_2px_var(--accent)]' : ''
            }`}
          >
            <span className="text-[13px] leading-[1.35] font-semibold text-[var(--text-primary)]">
              {note.title || 'Untitled'}
            </span>
            <p
              className={`m-0 overflow-hidden text-[11.5px] leading-[1.5] text-[var(--text-tertiary)] ${
                large ? 'line-clamp-5 text-[12.5px]' : 'line-clamp-3'
              }`}
            >
              {previewText(note)}
            </p>
            <div className="mt-auto flex items-center gap-1.5 pt-1">
              {note.label_id !== null && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: resolveLabelColor(label?.color) }}
                />
              )}
              <span className="font-mono text-[10.5px] text-[var(--text-tertiary)]">
                {label?.name ?? 'No label'} · {formatRelativeTime(note.updated_at)}
              </span>
            </div>
          </button>
        );
      })}
    </>
  );
}

export default NoteGridCards;
