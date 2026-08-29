import { join } from 'path';

const DATABASE_FILENAME = 'storynote.db';

// Storage location per schema.md: Electron's userData dir, isolated per-OS-user.
export function getDatabasePath(userDataPath: string): string {
  return join(userDataPath, DATABASE_FILENAME);
}
