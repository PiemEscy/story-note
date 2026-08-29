import migration001 from './001_init.sql?raw';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

// Imported as raw strings (Vite `?raw`) so migrations are embedded in the
// compiled main-process bundle — no filesystem reads needed at runtime,
// which would otherwise be unreliable once the app is packaged into an asar.
export const migrations: Migration[] = [{ version: 1, name: '001_init', sql: migration001 }];
