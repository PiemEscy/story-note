import { expect, test } from '@playwright/test';
import { launchIsolatedApp } from './testHelpers';
import { IPC_CHANNELS } from '../electron/ipc/channels';

// Simulates a real global keyboard shortcut's push event, the same way
// windows-integration.spec.ts's own shortcut tests do — used here only to
// force a note into its locked-and-not-yet-unlocked-this-session state
// (quick-lock), since Ctrl+F itself isn't a global shortcut.
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

// In-note search (Ctrl+F) and global-search highlighting. The underlying
// match-finding/decoration logic (position math, case-insensitivity, block-
// boundary safety, wraparound navigation) is unit-tested directly against a
// real ProseMirror EditorState in src/editor/searchHighlight.test.ts and
// src/editor/textSearch.test.ts — what's worth verifying here is that a
// real Ctrl+F keypress and real typing in the running app actually reach
// that logic and render the expected UI.

test('Ctrl+F opens a search bar scoped to the active note, highlighting matches live as the user types', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.locator('.tiptap').click();
    await page.keyboard.type('The quick brown fox jumps over the lazy dog.');
    await expect(page.locator('.tiptap')).toHaveText(
      'The quick brown fox jumps over the lazy dog.',
    );

    await page.keyboard.press('Control+f');
    const searchInput = page.getByPlaceholder('Find in note…');
    await expect(searchInput).toBeFocused();

    await searchInput.fill('the');
    // "The" (sentence-start) + "the" (before "lazy") — case-insensitivity
    // itself gets its own dedicated test below.
    await expect(page.locator('.search-match')).toHaveCount(2);
  } finally {
    await cleanup();
  }
});

test('the toolbar search button opens the same search bar as Ctrl+F', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.locator('.tiptap').click();
    await page.keyboard.type('The quick brown fox jumps over the lazy dog.');

    await page.getByTitle('Find in note (Ctrl+F)').click();

    const searchInput = page.getByPlaceholder('Find in note…');
    await expect(searchInput).toBeFocused();
    await searchInput.fill('the');
    await expect(page.locator('.search-match')).toHaveCount(2);
  } finally {
    await cleanup();
  }
});

test('the toolbar search button is hidden on a locked note', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Secret note');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data[0]?.title : undefined;
      })
      .toBe('Secret note');

    await page.getByTitle('More options').click();
    await page.getByRole('button', { name: 'Lock note', exact: true }).click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel('Password', { exact: true }).fill('correct horse battery');
    await modal.getByLabel('Confirm password').fill('correct horse battery');
    await modal.getByRole('button', { name: 'Lock note', exact: true }).click();
    await expect(modal).toBeHidden();

    await sendShortcut(app, 'quick-lock');
    await expect(
      page.getByText('This note is locked. Enter the password to view its content.'),
    ).toBeVisible();

    await expect(page.getByTitle('Find in note (Ctrl+F)')).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test('Ctrl+F pre-fills the query with the current text selection', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.locator('.tiptap').click();
    await page.keyboard.type('The quick brown fox jumps over the lazy dog.');
    await expect(page.locator('.tiptap')).toHaveText(
      'The quick brown fox jumps over the lazy dog.',
    );

    // Selects "quick" (chars 4-9) via the keyboard — deterministic, unlike
    // a double-click's word-boundary detection landing exactly where
    // intended. Keyboard input delivery to this window is occasionally
    // flaky in this sandboxed test environment (unrelated to this feature —
    // see note-editor-updates.spec.ts's Ctrl+D test for the same caveat),
    // so this retries the whole selection sequence until it actually lands.
    await expect
      .poll(async () => {
        await page.keyboard.press('Home');
        for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
        for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight');
        return page.evaluate(() => window.getSelection()?.toString());
      })
      .toBe('quick');

    await page.keyboard.press('Control+f');

    const searchInput = page.getByPlaceholder('Find in note…');
    await expect(searchInput).toHaveValue('quick');
    await expect(page.locator('.search-match')).toHaveCount(1);

    // The pre-filled text is selected in the input too, so typing replaces
    // it instead of appending to it — matches a browser's own Ctrl+F.
    const selection = await searchInput.evaluate((el: HTMLInputElement) => ({
      start: el.selectionStart,
      end: el.selectionEnd,
    }));
    expect(selection).toEqual({ start: 0, end: 'quick'.length });
  } finally {
    await cleanup();
  }
});

test('Ctrl+F with no selection leaves an existing query untouched', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.locator('.tiptap').click();
    await page.keyboard.type('dog cat dog');
    await expect(page.locator('.tiptap')).toHaveText('dog cat dog');

    await page.keyboard.press('Control+f');
    await page.getByPlaceholder('Find in note…').fill('dog');
    await expect(page.locator('.search-match')).toHaveCount(2);

    // Click back into the note body with no selection (a bare cursor),
    // then press Ctrl+F again.
    await page.locator('.tiptap').click();
    await page.keyboard.press('Control+f');

    await expect(page.getByPlaceholder('Find in note…')).toHaveValue('dog');
    await expect(page.locator('.search-match')).toHaveCount(2);
  } finally {
    await cleanup();
  }
});

test('search is case-insensitive: matches both "The" and "the"', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.locator('.tiptap').click();
    await page.keyboard.type('The cat sat. The cat ran.');
    await expect(page.locator('.tiptap')).toHaveText('The cat sat. The cat ran.');

    await page.keyboard.press('Control+f');
    await page.getByPlaceholder('Find in note…').fill('cat');

    await expect(page.locator('.search-match')).toHaveCount(2);
  } finally {
    await cleanup();
  }
});

test('next/previous navigation cycles through matches, with the current one visually distinguished', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.locator('.tiptap').click();
    await page.keyboard.type('cat sat cat mat cat');
    await expect(page.locator('.tiptap')).toHaveText('cat sat cat mat cat');

    await page.keyboard.press('Control+f');
    await page.getByPlaceholder('Find in note…').fill('cat');

    const matches = page.locator('.search-match');
    await expect(matches).toHaveCount(3);
    await expect(page.getByText('1/3', { exact: true })).toBeVisible();
    await expect(matches.nth(0)).toHaveClass(/search-match-current/);
    await expect(matches.nth(1)).not.toHaveClass(/search-match-current/);

    await page.getByTitle('Next match (Enter)').click();
    await expect(page.getByText('2/3', { exact: true })).toBeVisible();
    await expect(matches.nth(1)).toHaveClass(/search-match-current/);
    await expect(matches.nth(0)).not.toHaveClass(/search-match-current/);

    await page.getByTitle('Next match (Enter)').click();
    await page.getByTitle('Next match (Enter)').click(); // 3rd match, then wraps to the 1st
    await expect(page.getByText('1/3', { exact: true })).toBeVisible();
    await expect(matches.nth(0)).toHaveClass(/search-match-current/);

    await page.getByTitle('Previous match (Shift+Enter)').click();
    await expect(page.getByText('3/3', { exact: true })).toBeVisible(); // wraps backward too
    await expect(matches.nth(2)).toHaveClass(/search-match-current/);
  } finally {
    await cleanup();
  }
});

test('Enter and Shift+Enter in the search input also navigate matches', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.locator('.tiptap').click();
    await page.keyboard.type('dog cat dog');
    await expect(page.locator('.tiptap')).toHaveText('dog cat dog');

    await page.keyboard.press('Control+f');
    const searchInput = page.getByPlaceholder('Find in note…');
    await searchInput.fill('dog');
    await expect(page.getByText('1/2', { exact: true })).toBeVisible();

    await searchInput.press('Enter');
    await expect(page.getByText('2/2', { exact: true })).toBeVisible();

    await searchInput.press('Shift+Enter');
    await expect(page.getByText('1/2', { exact: true })).toBeVisible();
  } finally {
    await cleanup();
  }
});

test('Esc closes the search bar and clears all highlights', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.locator('.tiptap').click();
    await page.keyboard.type('find this word');
    await expect(page.locator('.tiptap')).toHaveText('find this word');

    await page.keyboard.press('Control+f');
    await page.getByPlaceholder('Find in note…').fill('word');
    await expect(page.locator('.search-match')).toHaveCount(1);

    await page.keyboard.press('Escape');

    await expect(page.getByPlaceholder('Find in note…')).toHaveCount(0);
    await expect(page.locator('.search-match')).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test('the close button also closes the search bar and clears highlights', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.locator('.tiptap').click();
    await page.keyboard.type('find this word');
    await expect(page.locator('.tiptap')).toHaveText('find this word');

    await page.keyboard.press('Control+f');
    await page.getByPlaceholder('Find in note…').fill('word');
    await expect(page.locator('.search-match')).toHaveCount(1);

    await page.getByTitle('Close (Esc)').click();

    await expect(page.getByPlaceholder('Find in note…')).toHaveCount(0);
    await expect(page.locator('.search-match')).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test('Ctrl+F does nothing on a locked note', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Secret note');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data[0]?.title : undefined;
      })
      .toBe('Secret note');

    await page.getByTitle('More options').click();
    await page.getByRole('button', { name: 'Lock note', exact: true }).click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel('Password', { exact: true }).fill('correct horse battery');
    await modal.getByLabel('Confirm password').fill('correct horse battery');
    await modal.getByRole('button', { name: 'Lock note', exact: true }).click();
    await expect(modal).toBeHidden();

    // Locking alone doesn't hide content the user was just looking at
    // (Phase 8) — force the locked-and-not-yet-unlocked state via
    // quick-lock, same as windows-integration.spec.ts's own lock tests.
    await sendShortcut(app, 'quick-lock');
    await expect(
      page.getByText('This note is locked. Enter the password to view its content.'),
    ).toBeVisible();

    await page.keyboard.press('Control+f');

    await expect(page.getByPlaceholder('Find in note…')).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test('opening a note from global search results highlights the matched term inside it', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Meeting notes');
    await page.locator('.tiptap').click();
    await page.keyboard.type('We discussed the quarterly roadmap and the budget.');
    // The note store's search() queries content_plain, which only reflects
    // what autosave has actually persisted — wait for that round trip
    // before searching, rather than a fixed delay.
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data[0]?.content_plain : undefined;
      })
      .toContain('roadmap');

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Unrelated note');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data.length : 0;
      })
      .toBe(2);

    await page.getByPlaceholder('Search notes…').fill('roadmap');
    await expect(page.getByText('Meeting notes', { exact: true })).toBeVisible();
    await page.getByText('Meeting notes', { exact: true }).click();

    // No Ctrl+F bar was opened — this is the global search's own highlight,
    // reusing the same decoration mechanism, not the in-note search UI.
    await expect(page.getByPlaceholder('Find in note…')).toHaveCount(0);
    const currentMatch = page.locator('.search-match-current');
    await expect(currentMatch).toHaveCount(1);
    await expect(currentMatch).toHaveText('roadmap');
  } finally {
    await cleanup();
  }
});
