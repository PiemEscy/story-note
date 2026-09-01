import { randomBytes } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Entry } from '@napi-rs/keyring';
import { _electron as electron, type ElectronApplication } from '@playwright/test';

// Launches the real app fully isolated from this machine's actual StoryNote
// install: --user-data-dir keeps the db file off the real profile,
// STORYNOTE_E2E_CREDENTIAL_SUFFIX (electron/db/keys.ts) keeps the OS-stored
// key off the real Windows Credential Manager entry — neither is covered by
// the other, so both are needed. Call `cleanup()` in a `finally` block.
export interface IsolatedApp {
  app: ElectronApplication;
  cleanup: () => Promise<void>;
}

export async function launchIsolatedApp(): Promise<IsolatedApp> {
  const isolated = createIsolatedUserData();
  const app = await isolated.launch();
  return {
    app,
    cleanup: async () => {
      await app.close();
      await isolated.cleanup();
    },
  };
}

// For a test that needs to close and relaunch the real app against the
// *same* on-disk database/userData dir — e.g. proving something is only
// persisted, not just held in the running process's memory (a fresh
// LockSession after restart, persisted window bounds surviving relaunch).
// `launch()` can be called more than once; the caller is responsible for
// closing whatever ElectronApplication(s) it creates before calling
// `cleanup()`, same as launchIsolatedApp's own `cleanup` closes its app
// first — this variant just can't do that automatically since it doesn't
// track which of possibly several launches are still open.
export interface IsolatedUserData {
  userDataDir: string;
  launch: () => Promise<ElectronApplication>;
  cleanup: () => Promise<void>;
}

export function createIsolatedUserData(): IsolatedUserData {
  const userDataDir = mkdtempSync(join(tmpdir(), 'storynote-e2e-'));
  const credentialSuffix = randomBytes(8).toString('hex');

  return {
    userDataDir,
    launch: () =>
      electron.launch({
        args: [join(__dirname, '../out/main/index.js'), `--user-data-dir=${userDataDir}`],
        env: { ...process.env, STORYNOTE_E2E_CREDENTIAL_SUFFIX: credentialSuffix },
      }),
    cleanup: async () => {
      rmSync(userDataDir, { recursive: true, force: true });
      new Entry('storynote', `sqlcipher-key-e2e-${credentialSuffix}`).deletePassword();
    },
  };
}
