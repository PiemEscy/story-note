import type { PublicNoteRow } from '../services/notesService';

// A locked note's content must never be shown in a list/grid/table preview
// (FR-5.3) — kept in one place since src/views/ has three separate
// renderers (list rows, details table, grid cards) that each need it.
// `isUnlocked`: whether this note has been unlocked for the current app
// session (useNoteStore's unlockedNoteIds) — once it has, content_plain is
// the note's real text (the server stops redacting it too, see
// electron/ipc/searchHandlers.ts/notesHandlers.ts), so the preview should
// show it like any other note instead of continuing to hide it forever.
export function previewText(note: PublicNoteRow, isUnlocked: boolean): string {
  if (note.is_locked && !isUnlocked) return 'Locked note';
  return note.content_plain.trim() || 'No additional text';
}
