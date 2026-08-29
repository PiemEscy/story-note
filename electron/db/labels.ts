import type Database from 'better-sqlite3-multiple-ciphers';
import type { LabelRow } from './types';

export interface CreateLabelInput {
  name: string;
  color?: string | null;
}

export function createLabel(db: Database.Database, input: CreateLabelInput): LabelRow {
  const result = db
    .prepare('INSERT INTO labels (name, color) VALUES (?, ?)')
    .run(input.name, input.color ?? null);

  return getLabelById(db, result.lastInsertRowid as number)!;
}

export function getLabelById(db: Database.Database, id: number): LabelRow | undefined {
  return db.prepare('SELECT * FROM labels WHERE id = ?').get(id) as LabelRow | undefined;
}

export function listLabels(db: Database.Database): LabelRow[] {
  return db.prepare('SELECT * FROM labels ORDER BY name COLLATE NOCASE ASC').all() as LabelRow[];
}

export interface UpdateLabelInput {
  name?: string;
  color?: string | null;
}

export function updateLabel(db: Database.Database, id: number, input: UpdateLabelInput): LabelRow {
  const current = getLabelById(db, id);
  if (!current) {
    throw new Error(`Label ${id} not found`);
  }

  db.prepare('UPDATE labels SET name = ?, color = ? WHERE id = ?').run(
    input.name ?? current.name,
    input.color !== undefined ? input.color : current.color,
    id,
  );

  return getLabelById(db, id)!;
}

// notes.label_id has ON DELETE SET NULL (enforced via PRAGMA foreign_keys —
// see electron/db/index.ts) — notes keep existing, they just lose the label.
export function deleteLabel(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM labels WHERE id = ?').run(id);
}

// Assigns (or clears, with labelId = null) a label on a note. A label
// change is one of the edits that bumps updated_at (schema.md), without
// touching title/content — see notes.ts's updateNote for the combined form.
export function assignLabelToNote(
  db: Database.Database,
  noteId: number,
  labelId: number | null,
): void {
  db.prepare('UPDATE notes SET label_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    labelId,
    noteId,
  );
}
