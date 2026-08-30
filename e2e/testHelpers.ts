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
  const userDataDir = mkdtempSync(join(tmpdir(), 'storynote-e2e-'));
  const credentialSuffix = randomBytes(8).toString('hex');

  const app = await electron.launch({
    args: [join(__dirname, '../out/main/index.js'), `--user-data-dir=${userDataDir}`],
    env: { ...process.env, STORYNOTE_E2E_CREDENTIAL_SUFFIX: credentialSuffix },
  });

  return {
    app,
    cleanup: async () => {
      await app.close();
      rmSync(userDataDir, { recursive: true, force: true });
      new Entry('storynote', `sqlcipher-key-e2e-${credentialSuffix}`).deletePassword();
    },
  };
}
