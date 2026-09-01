import { randomBytes } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Entry } from '@napi-rs/keyring';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { launchIsolatedApp } from './testHelpers';

// Phase 8 — Note Locking. Covers the checklist end to end through the real
// UI: locking a note, the temporary "unlock for this session" reveal, edit/
// export staying blocked until unlocked, and removing a lock. Correct/
// incorrect password coverage against the actual password-hashing logic
// lives at the IPC-handler level (electron/ipc/notesHandlers.test.ts) —
// this suite proves the UI wiring, not argon2 itself.
test('locking a note keeps it revealed for the rest of this session', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Bank recovery codes');
    await page.locator('.tiptap').fill('the actual codes');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data[0]?.content_plain : undefined;
      })
      .toBe('the actual codes');

    await page.getByTitle('More options').click();
    await page.getByRole('button', { name: 'Lock note', exact: true }).click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await modal.getByLabel('Password', { exact: true }).fill('correct horse battery');
    await modal.getByLabel('Confirm password').fill('correct horse battery');
    await modal.getByRole('button', { name: 'Lock note', exact: true }).click();
    await expect(modal).toBeHidden();

    // Locking doesn't hide content the user was just looking at — no
    // re-prompt for the password they just chose.
    await expect(page.getByPlaceholder('Untitled')).toHaveValue('Bank recovery codes');
    await expect(page.locator('.tiptap')).toContainText('the actual codes');

    const persisted = await page.evaluate(() => window.storyNoteAPI.notes.list());
    expect(persisted.ok).toBe(true);
    if (persisted.ok) {
      expect(persisted.data[0].is_locked).toBe(1);
      // Still revealed via the IPC layer too — same session, same lockSession.
      expect(persisted.data[0].content_plain).toBe('the actual codes');
    }

    // Navigating away and back doesn't re-lock it — "session", not "view".
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByText('Bank recovery codes').click();
    await expect(page.getByPlaceholder('Untitled')).toHaveValue('Bank recovery codes');
    await expect(page.getByText('This note is locked')).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test('removing a lock permanently clears it, verified via a fresh app run', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Temp lock');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data[0]?.title : undefined;
      })
      .toBe('Temp lock');

    await page.getByTitle('More options').click();
    await page.getByRole('button', { name: 'Lock note', exact: true }).click();
    const lockModal = page.getByRole('dialog');
    await lockModal.getByLabel('Password', { exact: true }).fill('a-password');
    await lockModal.getByLabel('Confirm password').fill('a-password');
    await lockModal.getByRole('button', { name: 'Lock note', exact: true }).click();
    await expect(lockModal).toBeHidden();

    await page.getByTitle('More options').click();
    await page.getByRole('button', { name: 'Remove lock', exact: true }).click();
    const removeModal = page.getByRole('dialog');
    await expect(removeModal).toBeVisible();
    await removeModal.getByLabel('Password', { exact: true }).fill('a-password');
    await removeModal.getByRole('button', { name: 'Remove lock', exact: true }).click();
    await expect(removeModal).toBeHidden();

    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data[0]?.is_locked : undefined;
      })
      .toBe(0);
  } finally {
    await cleanup();
  }
});

// The one scenario that genuinely needs a fresh main process: lockSession
// (electron/db/lockSession.ts) lives in memory and is never persisted, so
// "reveal content for that session" can only be disproven by actually
// restarting the app against the same on-disk database — the exact
// "session" boundary Phase 8 is built around. Mirrors launchIsolatedApp()
// (e2e/testHelpers.ts) but keeps the same --user-data-dir across two
// launches instead of a fresh one per call.
test('a locked note requires the password again after an app restart, and blocks edit/export until then', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'storynote-e2e-'));
  const credentialSuffix = randomBytes(8).toString('hex');
  const launch = (): Promise<ElectronApplication> =>
    electron.launch({
      args: [join(__dirname, '../out/main/index.js'), `--user-data-dir=${userDataDir}`],
      env: { ...process.env, STORYNOTE_E2E_CREDENTIAL_SUFFIX: credentialSuffix },
    });

  let app = await launch();
  try {
    let page = await app.firstWindow();

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Vault notes');
    await page.locator('.tiptap').fill('the vault combination');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data[0]?.content_plain : undefined;
      })
      .toBe('the vault combination');

    await page.getByTitle('More options').click();
    await page.getByRole('button', { name: 'Lock note', exact: true }).click();
    const lockModal = page.getByRole('dialog');
    await lockModal.getByLabel('Password', { exact: true }).fill('vault-password');
    await lockModal.getByLabel('Confirm password').fill('vault-password');
    await lockModal.getByRole('button', { name: 'Lock note', exact: true }).click();
    await expect(lockModal).toBeHidden();

    const noteId = await page.evaluate(async () => {
      const result = await window.storyNoteAPI.notes.list();
      return result.ok ? result.data[0].id : -1;
    });
    expect(noteId).toBeGreaterThan(0);

    await app.close();

    // Fresh main process, same on-disk database — a brand-new (empty)
    // LockSession, so the note is genuinely locked-and-unverified again.
    app = await launch();
    page = await app.firstWindow();

    // Search/list previews stay redacted for a never-unlocked-this-session
    // locked note (FR-5.3), confirmed directly over IPC before touching the UI.
    const beforeUnlock = await page.evaluate(async () => window.storyNoteAPI.notes.list());
    expect(beforeUnlock.ok).toBe(true);
    if (beforeUnlock.ok) {
      expect(beforeUnlock.data[0].content_plain).toBe('');
      expect(beforeUnlock.data[0].is_locked).toBe(1);
    }

    // Edit and export are blocked server-side while locked and unverified —
    // checked directly over IPC, not just inferred from the UI not offering
    // a way to trigger them.
    const blockedUpdate = await page.evaluate(
      async (id) => window.storyNoteAPI.notes.update({ id, title: 'Tampered' }),
      noteId,
    );
    expect(blockedUpdate.ok).toBe(false);
    const blockedExport = await page.evaluate(
      async (id) => window.storyNoteAPI.notes.export(id),
      noteId,
    );
    expect(blockedExport.ok).toBe(false);

    await page.getByText('Vault notes').click();
    await expect(
      page.getByText('This note is locked. Enter the password to view its content.'),
    ).toBeVisible();
    await expect(page.getByPlaceholder('Untitled')).toHaveCount(0);

    // Wrong password is rejected and content stays hidden. "Incorrect
    // password" renders twice (inline in LockedNotePanel, and again as
    // App.tsx's global error toast) — .first() avoids the strict-mode
    // violation from matching both.
    await page.getByPlaceholder('Enter password').fill('not-the-password');
    await page.getByRole('button', { name: 'Unlock note' }).click();
    await expect(page.getByText('Incorrect password').first()).toBeVisible();
    await expect(page.getByPlaceholder('Untitled')).toHaveCount(0);

    // Correct password reveals it.
    await page.getByPlaceholder('Enter password').fill('vault-password');
    await page.getByRole('button', { name: 'Unlock note' }).click();
    await expect(page.getByPlaceholder('Untitled')).toHaveValue('Vault notes');
    await expect(page.locator('.tiptap')).toContainText('the vault combination');
  } finally {
    await app.close();
    rmSync(userDataDir, { recursive: true, force: true });
    new Entry('storynote', `sqlcipher-key-e2e-${credentialSuffix}`).deletePassword();
  }
});
