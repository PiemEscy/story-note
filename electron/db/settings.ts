import type Database from 'better-sqlite3-multiple-ciphers';

export function getSetting(db: Database.Database, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined;
  return row?.value;
}

export function getAllSettings(db: Database.Database): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];

  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function deleteSetting(db: Database.Database, key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}
