CREATE TABLE labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_labels_name ON labels(name);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  content_plain TEXT NOT NULL DEFAULT '',
  label_id INTEGER REFERENCES labels(id) ON DELETE SET NULL,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  is_locked INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX idx_notes_label_id ON notes(label_id);
CREATE INDEX idx_notes_is_pinned ON notes(is_pinned);
CREATE INDEX idx_notes_is_archived ON notes(is_archived);
CREATE INDEX idx_notes_deleted_at ON notes(deleted_at);
CREATE INDEX idx_notes_updated_at ON notes(updated_at);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
