import { expect, test } from '@playwright/test';
import { createIsolatedUserData, launchIsolatedApp } from './testHelpers';
import { IPC_CHANNELS } from '../electron/ipc/channels';

// Phase 10 — Windows Integration.
//
// Deep tray/menu interaction (an actual OS-level click on the tray icon)
// isn't something Playwright can drive — there's no OS automation for the
// system tray, and testing.md explicitly treats this as expected ("hard to
// meaningfully unit test... covered instead by a light E2E check"). What
// *is* both meaningful and driveable is the reason "restore from tray"
// exists at all: closing the window must not end the app run, and the
// window must still be genuinely showable afterward, not actually
// destroyed. electron/tray.test.ts separately covers the restore logic
// itself (show + focus) in isolation.
test('closing the window hides it instead of quitting the app; it can still be shown again', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Still here after close');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data[0]?.title : undefined;
      })
      .toBe('Still here after close');

    const isVisibleBefore = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    );
    expect(isVisibleBefore).toBe(true);

    // Simulates clicking the window's own close (X) button.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());

    await expect
      .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()))
      .toBe(false);
    // Not destroyed — still exactly one (hidden) window, and the main
    // process / database connection are both still alive: the renderer
    // still answers a real IPC call even while hidden.
    const windowCount = await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    );
    expect(windowCount).toBe(1);
    const stillRunning = await page.evaluate(() => window.storyNoteAPI.notes.list());
    expect(stillRunning.ok).toBe(true);
    if (stillRunning.ok) {
      expect(stillRunning.data[0]?.title).toBe('Still here after close');
    }

    // "Restore from tray" — the window can be shown again; it was hidden,
    // not gone. (electron/tray.test.ts covers that the tray's own restore
    // handler calls exactly show()+focus() in isolation.)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
    await expect
      .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()))
      .toBe(true);
  } finally {
    await cleanup();
  }
});

// settings.window_bounds (schema.md) is written on 'resize'/'move', debounced
// 500ms (electron/main.ts) — needs a real restart against the same on-disk
// database to prove it's actually persisted, not just held in the running
// process's own BrowserWindow state.
test('resizing and moving the window persists its bounds across a restart', async () => {
  const isolated = createIsolatedUserData();
  let app = await isolated.launch();

  try {
    // Waits for the window to actually exist before evaluating against it —
    // launch() only waits for the process to start, same reason
    // launchIsolatedApp()'s own callers always await firstWindow() first.
    await app.firstWindow();

    const targetBounds = { x: 80, y: 60, width: 900, height: 700 };
    await app.evaluate(
      ({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setBounds(bounds),
      targetBounds,
    );
    // Past the 500ms debounce in electron/main.ts's scheduleSaveBounds.
    await new Promise((resolve) => setTimeout(resolve, 800));

    await app.close();
    app = await isolated.launch();
    await app.firstWindow();

    const restoredBounds = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getBounds(),
    );
    // Not an exact match — Windows/Electron can nudge a requested setBounds()
    // by a few px (DPI scaling, frame-vs-content-area rounding); a wide
    // tolerance still clearly distinguishes "persisted and restored" from
    // "fell back to the 1200x800 default" (a >200px gap), which is the only
    // failure mode this test actually needs to catch.
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(restoredBounds[key] - targetBounds[key])).toBeLessThan(20);
    }
  } finally {
    await app.close();
    await isolated.cleanup();
  }
});

// settings.start_minimized (schema.md) — checked once on app.whenReady(),
// skipping the initial show() (architecture.md's Windows Integration
// table) rather than showing then immediately hiding.
test('start_minimized keeps the window hidden on the next launch', async () => {
  const isolated = createIsolatedUserData();
  let app = await isolated.launch();

  try {
    const page = await app.firstWindow();
    await page.evaluate(() => window.storyNoteAPI.settings.set('start_minimized', 'true'));

    await app.close();
    app = await isolated.launch();
    await app.firstWindow();

    const isVisible = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    );
    expect(isVisible).toBe(false);
  } finally {
    await app.close();
    await isolated.cleanup();
  }
});

// settings.always_on_top — applied as a BrowserWindow constructor option at
// launch; also live-toggleable both from the tray's context menu (persisted
// there via a custom setAlwaysOnTop dep in main.ts, not exercised here since
// there's no way to drive a real OS tray-menu click from a test) and, since
// Phase 11, from the Settings panel (exercised below).
test('always_on_top is applied to the window at launch', async () => {
  const isolated = createIsolatedUserData();
  let app = await isolated.launch();

  try {
    const page = await app.firstWindow();
    await page.evaluate(() => window.storyNoteAPI.settings.set('always_on_top', 'true'));

    await app.close();
    app = await isolated.launch();
    await app.firstWindow();

    const isAlwaysOnTop = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isAlwaysOnTop(),
    );
    expect(isAlwaysOnTop).toBe(true);
  } finally {
    await app.close();
    await isolated.cleanup();
  }
});

// The Settings panel's own toggle (electron/ipc/windowHandlers.ts) — unlike
// the tray menu, this one is driveable from a test. Deliberately not
// exercising the neighboring "Launch at startup" toggle here: that one calls
// the real app.setLoginItemSettings, which would register this test run's
// actual Electron binary to start at login on whatever machine runs this
// suite — a genuine, unwanted OS side effect, not something to trigger for
// real just to test it. electron/loginItem.test.ts and
// electron/ipc/windowHandlers.test.ts already cover that logic with an
// injected setLoginItemSettings mock instead.
test('the Settings panel Always on top toggle takes effect immediately, and persists', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();

    const isAlwaysOnTop = (): Promise<boolean> =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop());
    expect(await isAlwaysOnTop()).toBe(false);

    await page.getByTitle('Settings').click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    const alwaysOnTopToggle = dialog.getByRole('checkbox', { name: /Always on top/ });
    await expect(alwaysOnTopToggle).not.toBeChecked();

    await alwaysOnTopToggle.click();

    await expect(alwaysOnTopToggle).toBeChecked();
    await expect.poll(isAlwaysOnTop).toBe(true);
    const persisted = await page.evaluate(() => window.storyNoteAPI.settings.get('always_on_top'));
    expect(persisted).toEqual({ ok: true, data: 'true' });
  } finally {
    await cleanup();
  }
});

// Global keyboard shortcuts (Ctrl+Shift+N/F/L, electron/shortcuts.ts) fire
// system-wide and can't be simulated via real OS key injection from
// Playwright — the same class of limitation as an OS-level tray click
// (testing.md). What IS driveable and meaningful is the renderer's reaction
// to the push event a real shortcut sends (App.tsx/Sidebar.tsx's
// window.storyNoteAPI.shortcuts.onTrigger subscriptions) — simulated here by
// sending the exact IPC message electron/shortcuts.ts sends for real,
// directly from the main process side. electron/shortcuts.test.ts covers the
// OS-registration/dispatch logic itself in isolation.
function sendShortcut(
  app: Awaited<ReturnType<typeof launchIsolatedApp>>['app'],
  action: string,
): Promise<void> {
  return app.evaluate(
    ({ BrowserWindow }, { channel, action: sentAction }) => {
      BrowserWindow.getAllWindows()[0].webContents.send(channel, sentAction);
    },
    { channel: IPC_CHANNELS.shortcuts.trigger, action },
  );
}

test('new-note shortcut creates a note', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    // firstWindow() only waits for the page to exist/start loading, not for
    // React to have mounted and run its onTrigger subscription effect —
    // wait for real UI before sending the shortcut, or the renderer isn't
    // listening yet and the event is simply missed.
    await page.getByRole('button', { name: 'New note' }).first().waitFor();

    await sendShortcut(app, 'new-note');

    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data.length : 0;
      })
      .toBe(1);
    await expect(page.getByPlaceholder('Untitled')).toBeVisible();
  } finally {
    await cleanup();
  }
});

test('focus-search shortcut focuses the sidebar search input', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'New note' }).first().waitFor();

    await sendShortcut(app, 'focus-search');

    await expect(page.getByPlaceholder('Search notes…')).toBeFocused();
  } finally {
    await cleanup();
  }
});

// Note on scope: a real Ctrl+Shift+L both clears the main process's
// LockSession (electron/shortcuts.ts calls lockSession.lockAll() inside the
// actual globalShortcut callback) *and* pushes this event to the renderer.
// Only the second half is reachable here — sendShortcut() sends the exact
// push message a real trigger sends, but doesn't go through
// registerGlobalShortcuts()'s callback, so it can't exercise the
// server-side clear (there's deliberately no general-purpose IPC channel
// that would let the renderer clear it directly either — see
// electron/shortcuts.ts). electron/shortcuts.test.ts's "quick-lock clears
// the LockSession before notifying the renderer" test covers that half in
// isolation; this test covers the renderer's reaction to the notification —
// that unlockedNoteIds gets cleared and the editor falls back to
// LockedNotePanel — which is genuinely exercisable this way.
test('quick-lock notification makes the editor fall back to the locked panel', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Panic test');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data[0]?.title : undefined;
      })
      .toBe('Panic test');

    await page.getByTitle('More options').click();
    await page.getByRole('button', { name: 'Lock note', exact: true }).click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel('Password', { exact: true }).fill('secret');
    await modal.getByLabel('Confirm password').fill('secret');
    await modal.getByRole('button', { name: 'Lock note', exact: true }).click();
    await expect(modal).toBeHidden();
    // Still revealed this session — locking doesn't hide content the user
    // was just looking at (Phase 8).
    await expect(page.getByPlaceholder('Untitled')).toBeVisible();

    await sendShortcut(app, 'quick-lock');

    await expect(
      page.getByText('This note is locked. Enter the password to view its content.'),
    ).toBeVisible();
    await expect(page.getByPlaceholder('Untitled')).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

// Compact mode (storynote-ui-reference.html's .is-compact) — reduces the
// list toolbar's and each note row's top/bottom padding.
test('compact mode reduces note row height and persists the choice', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Row A');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data[0]?.title : undefined;
      })
      .toBe('Row A');

    const row = page.getByRole('button', { name: /Row A/ });
    const heightBefore = (await row.boundingBox())?.height;
    expect(heightBefore).toBeGreaterThan(0);

    await page.getByTitle('Settings').click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    const compactToggle = dialog.getByRole('checkbox', { name: /Compact mode/ });
    await expect(compactToggle).not.toBeChecked();
    await compactToggle.click();
    await expect(compactToggle).toBeChecked();
    await dialog.getByRole('button', { name: 'Close' }).click();

    await expect.poll(async () => (await row.boundingBox())?.height).toBeLessThan(heightBefore!);

    const persisted = await page.evaluate(() => window.storyNoteAPI.settings.get('compact_mode'));
    expect(persisted).toEqual({ ok: true, data: 'true' });
  } finally {
    await cleanup();
  }
});

// storynote-ui-reference.html's .sidebar-resize-handle — a real mouse drag,
// not a simulated store call, so this also exercises the mousedown/
// mousemove/mouseup wiring in Sidebar.tsx itself.
test('dragging the sidebar resize handle changes its width and persists the choice', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    const handle = page.getByTitle('Resizable sidebar');
    const box = await handle.boundingBox();
    if (!box) throw new Error('resize handle not visible');

    await page.mouse.move(box.x + box.width / 2, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 100);
    await page.mouse.up();

    const persisted = await page.evaluate(() => window.storyNoteAPI.settings.get('sidebar_width'));
    expect(persisted.ok).toBe(true);
    if (persisted.ok) {
      // Started at the 240px default; dragged +120px, clamped to [180, 480]
      // — comfortably inside that range either way, so this just confirms a
      // real, substantially wider value was persisted, not an exact px match
      // (drag delivery isn't pixel-perfect across platforms).
      expect(Number(persisted.data)).toBeGreaterThan(300);
    }
  } finally {
    await cleanup();
  }
});

// settings.last_note_id (schema.md) — persisted on every selectNote()/
// createNote() call, restored once loadNotes() resolves on the next launch.
test('remembers the last opened note across a restart', async () => {
  const isolated = createIsolatedUserData();
  let app = await isolated.launch();

  try {
    const page = await app.firstWindow();

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('First note');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data.length : 0;
      })
      .toBe(1);

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Remembered note');
    // Waits for the title itself to flush (not just for the note to exist)
    // — app.close() below tears down the process outright, giving a still-
    // pending 600ms autosave debounce no chance to run, unlike switching
    // notes within the same session (which flushes on unmount).
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok
          ? result.data.find((n) => n.title === 'Remembered note')?.title
          : undefined;
      })
      .toBe('Remembered note');
    // "Remembered note" is the active note at the moment the app closes below.

    await app.close();
    app = await isolated.launch();
    const page2 = await app.firstWindow();

    await expect(page2.getByPlaceholder('Untitled')).toHaveValue('Remembered note');
  } finally {
    await app.close();
    await isolated.cleanup();
  }
});
