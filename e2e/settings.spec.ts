import { expect, test } from '@playwright/test';
import { createIsolatedUserData } from './testHelpers';

// Phase 11 — Settings. ADR-001's master-password mode is the highest-stakes
// piece of this phase: switching to it re-keys the actual database file, and
// the *next* launch depends entirely on the new startup unlock flow
// (electron/main.ts's tryUnlock/completeStartup, src/AppRoot.tsx) actually
// working — getting this wrong would lock a real user out of their own
// notes. Exercised directly over IPC here (keyMode.setPassword) rather than
// through the Settings panel UI, so this test is independent of exactly how
// that UI is built; the UI itself (the Enable/Disable flow, the mismatched-
// password validation, the "no recovery" warning) is covered separately by
// the test below this one.
test('switching to master-password mode requires the password again after a restart, and rejects a wrong one', async () => {
  const isolated = createIsolatedUserData();
  let app = await isolated.launch();

  try {
    const page = await app.firstWindow();

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Secret database note');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data[0]?.title : undefined;
      })
      .toBe('Secret database note');

    const switched = await page.evaluate(() =>
      window.storyNoteAPI.keyMode.setPassword('db-master-password'),
    );
    expect(switched).toEqual({ ok: true, data: undefined });

    await app.close();
    app = await isolated.launch();
    const page2 = await app.firstWindow();

    // The unlock screen shows instead of the normal app — no note UI, no
    // working IPC handler for notes/labels/settings/search yet (only
    // app.isLocked/app.unlock are registered before unlock succeeds).
    await expect(
      page2.getByText('This database is protected by a master password. Enter it to continue.'),
    ).toBeVisible();
    await expect(page2.getByRole('button', { name: 'New note' })).toHaveCount(0);
    const stillLocked = await page2.evaluate(() => window.storyNoteAPI.app.isLocked());
    expect(stillLocked).toEqual({ ok: true, data: true });

    // Wrong password is rejected — still locked afterward.
    await page2.getByPlaceholder('Enter master password').fill('not-the-password');
    await page2.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page2.getByText('Incorrect password')).toBeVisible();
    await expect(page2.getByRole('button', { name: 'New note' })).toHaveCount(0);

    // Correct password unlocks — the real app (and the note created before
    // switching modes) appears.
    await page2.getByPlaceholder('Enter master password').fill('db-master-password');
    await page2.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page2.getByRole('button', { name: 'New note' }).first()).toBeVisible();
    await expect
      .poll(async () => {
        const result = await page2.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data[0]?.title : undefined;
      })
      .toBe('Secret database note');
  } finally {
    await app.close();
    await isolated.cleanup();
  }
});

// The UI counterpart to the direct-IPC test above — drives the actual
// Settings panel form (src/components/SettingsModal.tsx): the mismatched-
// password validation, the "no recovery" warning's visibility, and the
// Enable/Disable buttons themselves, not just the backend they call.
test('enabling and disabling a master password through the Settings panel works end-to-end', async () => {
  const isolated = createIsolatedUserData();
  let app = await isolated.launch();

  try {
    const page = await app.firstWindow();
    await page.getByTitle('Settings', { exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(
      dialog.getByText('No master password set — StoryNote unlocks automatically.'),
    ).toBeVisible();

    await dialog.getByRole('button', { name: 'Enable' }).click();
    await expect(dialog.getByText(/no way to recover your notes/)).toBeVisible();

    const passwordInput = dialog.getByPlaceholder('New master password');
    const confirmInput = dialog.getByPlaceholder('Confirm password');
    const submitEnable = dialog.getByRole('button', { name: 'Enable', exact: true });

    await passwordInput.fill('ui-master-password');
    await confirmInput.fill('a-different-password');
    await expect(dialog.getByText('Passwords do not match.')).toBeVisible();
    await expect(submitEnable).toBeDisabled();

    await confirmInput.fill('ui-master-password');
    await expect(dialog.getByText('Passwords do not match.')).toHaveCount(0);
    await expect(submitEnable).toBeEnabled();
    await submitEnable.click();

    await expect(dialog.getByText('StoryNote is protected by a master password.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();

    await app.close();
    app = await isolated.launch();
    const page2 = await app.firstWindow();

    await expect(
      page2.getByText('This database is protected by a master password. Enter it to continue.'),
    ).toBeVisible();
    await page2.getByPlaceholder('Enter master password').fill('ui-master-password');
    await page2.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page2.getByTitle('Settings', { exact: true })).toBeVisible();

    await page2.getByTitle('Settings', { exact: true }).click();
    const dialog2 = page2.getByRole('dialog', { name: 'Settings' });
    await expect(dialog2.getByText('StoryNote is protected by a master password.')).toBeVisible();
    await dialog2.getByRole('button', { name: 'Disable' }).click();
    await expect(
      dialog2.getByText('No master password set — StoryNote unlocks automatically.'),
    ).toBeVisible();
    await dialog2.getByRole('button', { name: 'Close' }).click();

    await app.close();
    app = await isolated.launch();
    const page3 = await app.firstWindow();

    await expect(page3.getByRole('button', { name: 'New note' }).first()).toBeVisible();
    const locked = await page3.evaluate(() => window.storyNoteAPI.app.isLocked());
    expect(locked).toEqual({ ok: true, data: false });
  } finally {
    await app.close();
    await isolated.cleanup();
  }
});

// Regression coverage for a code-review finding: createWindow() may run
// before `db` exists (to show the unlock screen at all), so it falls back to
// default bounds/always-on-top — completeStartup() must reconcile the
// already-created window with the actually-persisted values once the
// password is submitted and the settings table becomes reachable, not leave
// it stuck on defaults for the rest of that run.
test('always_on_top and window bounds are reapplied to the window after unlocking in password mode', async () => {
  const isolated = createIsolatedUserData();
  let app = await isolated.launch();

  try {
    const page = await app.firstWindow();

    await page.evaluate(async () => {
      await window.storyNoteAPI.settings.set(
        'window_bounds',
        JSON.stringify({ width: 900, height: 700 }),
      );
      await window.storyNoteAPI.settings.set('always_on_top', 'true');
    });
    const switched = await page.evaluate(() =>
      window.storyNoteAPI.keyMode.setPassword('reconcile-password'),
    );
    expect(switched.ok).toBe(true);

    await app.close();
    app = await isolated.launch();
    const page2 = await app.firstWindow();

    // Before unlocking: createWindow() ran with no `db`, so the persisted
    // values above weren't applied yet — confirms the test actually
    // exercises the reconciliation path, not a constructor-time coincidence.
    const alwaysOnTopBeforeUnlock = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isAlwaysOnTop(),
    );
    expect(alwaysOnTopBeforeUnlock).toBe(false);

    await page2.getByPlaceholder('Enter master password').fill('reconcile-password');
    await page2.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page2.getByRole('button', { name: 'New note' }).first()).toBeVisible();

    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop()),
      )
      .toBe(true);
    const bounds = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getBounds(),
    );
    // Tolerance rather than an exact match — same OS-level rounding
    // (DPI/border adjustments) windows-integration.spec.ts's own bounds
    // round-trip test already accounts for.
    expect(Math.abs(bounds.width - 900)).toBeLessThan(20);
    expect(Math.abs(bounds.height - 700)).toBeLessThan(20);
  } finally {
    await app.close();
    await isolated.cleanup();
  }
});

// Switching back to OS mode doesn't need the current password — the app is
// already running with the database decrypted at that point.
test('switching back to OS mode makes the next launch require no password', async () => {
  const isolated = createIsolatedUserData();
  let app = await isolated.launch();

  try {
    const page = await app.firstWindow();

    const toPassword = await page.evaluate(() =>
      window.storyNoteAPI.keyMode.setPassword('temporary-password'),
    );
    expect(toPassword.ok).toBe(true);

    const backToOs = await page.evaluate(() => window.storyNoteAPI.keyMode.setOs());
    expect(backToOs).toEqual({ ok: true, data: undefined });

    await app.close();
    app = await isolated.launch();
    const page2 = await app.firstWindow();

    // Straight into the real app, no unlock screen.
    await expect(page2.getByRole('button', { name: 'New note' }).first()).toBeVisible();
    const locked = await page2.evaluate(() => window.storyNoteAPI.app.isLocked());
    expect(locked).toEqual({ ok: true, data: false });
  } finally {
    await app.close();
    await isolated.cleanup();
  }
});
