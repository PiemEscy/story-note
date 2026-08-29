import type Database from 'better-sqlite3-multiple-ciphers';
import { migrations } from './migrations';

// Migration progress is tracked via SQLite's built-in PRAGMA user_version —
// simpler than a schema_migrations table for a forward-only, single-user db.
export function runMigrations(db: Database.Database): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;
  const pending = migrations
    .filter((migration) => migration.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    const apply = db.transaction(() => {
      db.exec(migration.sql);
      // PRAGMA doesn't support bound parameters; safe here because
      // `migration.version` is always a hardcoded number from our own
      // migrations array, never user input.
      db.pragma(`user_version = ${migration.version}`);
    });
    apply();
  }
}
