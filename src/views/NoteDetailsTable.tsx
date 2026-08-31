import type { PublicNoteRow } from '../services/notesService';
import type { LabelRow } from '../services/labelsService';
import { resolveLabelColor } from '../store/useLabelStore';
import { formatRelativeTime, formatShortDate } from '../utils/formatDate';

interface NoteDetailsTableProps {
  notes: PublicNoteRow[];
  activeNoteId: number | null;
  labels: LabelRow[];
  onSelect: (id: number) => void;
}

// Matches storynote-ui-reference.html's .details-table (Title/Label/
// Modified/Created columns).
function NoteDetailsTable({
  notes,
  activeNoteId,
  labels,
  onSelect,
}: NoteDetailsTableProps): React.JSX.Element {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          {['Title', 'Label', 'Modified', 'Created'].map((heading) => (
            <th
              key={heading}
              className="sticky top-0 z-[2] border-b border-[var(--border)] bg-[var(--bg-surface-raised)] px-3 py-2 text-left text-[10.5px] font-semibold tracking-wide text-[var(--text-tertiary)] uppercase"
            >
              {heading}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {notes.map((note) => {
          const label = labels.find((candidate) => candidate.id === note.label_id);

          return (
            <tr
              key={note.id}
              onClick={() => onSelect(note.id)}
              className={`cursor-pointer border-b border-[var(--border)] transition-colors ${
                activeNoteId === note.id ? 'bg-[var(--bg-active)]' : 'hover:bg-[var(--bg-hover)]'
              }`}
            >
              <td className="flex items-center gap-2 px-3 py-2 text-[12.5px] font-semibold text-[var(--text-primary)]">
                {note.label_id !== null && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: resolveLabelColor(label?.color) }}
                  />
                )}
                <span className="truncate">{note.title || 'Untitled'}</span>
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-[var(--text-tertiary)]">
                {label?.name ?? '—'}
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-[var(--text-tertiary)]">
                {formatRelativeTime(note.updated_at)}
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-[var(--text-tertiary)]">
                {formatShortDate(note.created_at)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default NoteDetailsTable;
