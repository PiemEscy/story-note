import type { PublicNoteRow } from '../services/notesService';

// A locked note's content must never be shown in a list/grid/table preview
// (FR-5.3) — kept in one place since src/views/ has three separate
// renderers (list rows, details table, grid cards) that each need it.
export function previewText(note: PublicNoteRow): string {
  if (note.is_locked) return 'Locked note — content hidden';
  return note.content_plain.trim() || 'No additional text';
}
