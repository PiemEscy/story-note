// Row shapes mirror schema.md's snake_case columns exactly — any reshaping
// to camelCase for the renderer happens at the IPC boundary (Phase 2), not
// in this data layer.

export interface NoteRow {
  id: number;
  title: string;
  content: string;
  content_plain: string;
  label_id: number | null;
  is_pinned: number;
  is_archived: number;
  is_locked: number;
  password_hash: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LabelRow {
  id: number;
  name: string;
  color: string | null;
  created_at: string;
}
