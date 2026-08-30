import { expect, test } from '@playwright/test';
import { launchIsolatedApp } from './testHelpers';

// Exercises the actual rendered UI (not just the IPC handlers directly, like
// the Vitest suite) end to end: create → autosave → archive/unarchive →
// soft-delete → restore → permanently delete. Confirms autosave really
// persisted by querying window.storyNoteAPI directly, not just trusting
// what's rendered.
test('full note lifecycle through the real UI: create, autosave, archive, trash, restore, purge', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await expect(page).toHaveTitle('StoryNote');
    await expect(page.getByText('No notes yet')).toBeVisible();

    // ---- Create ----
    await page.getByRole('button', { name: 'New note' }).first().click();
    const titleInput = page.getByPlaceholder('Untitled');
    await expect(titleInput).toBeVisible();

    // ---- Edit + autosave ----
    await titleInput.fill('My first note');
    // TipTap's content area is a contenteditable div (.tiptap, set by
    // @tiptap/core), not an <input>/<textarea> — its "placeholder" is a CSS
    // ::before pseudo-element (@tiptap/extension-placeholder), not a real
    // HTML placeholder attribute, so it isn't reachable via getByPlaceholder.
    await page.locator('.tiptap').fill('Hello from the e2e test.');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data[0]?.content_plain : undefined;
      })
      .toBe('Hello from the e2e test.');

    const persisted = await page.evaluate(() => window.storyNoteAPI.notes.list());
    expect(persisted.ok).toBe(true);
    if (persisted.ok) {
      expect(persisted.data).toHaveLength(1);
      expect(persisted.data[0].title).toBe('My first note');
    }

    // ---- Archive / unarchive ----
    await page.getByTitle('More options').click();
    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(
      page.getByText('Select a note to view it here, or create a new one.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Archived' }).click();
    await expect(page.getByText('My first note')).toBeVisible();

    await page.getByText('My first note').click();
    await page.getByTitle('More options').click();
    await page.getByRole('button', { name: 'Unarchive' }).click();

    await page.getByRole('button', { name: 'All Notes' }).click();
    await expect(page.getByText('My first note')).toBeVisible();

    // ---- Soft delete (with confirmation) ----
    await page.getByText('My first note').click();
    await page.getByTitle('More options').click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    const deleteDialog = page.getByRole('dialog');
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.getByText('No notes yet')).toBeVisible();

    // ---- Trash: restore ----
    await page.getByRole('button', { name: 'Trash' }).click();
    await expect(page.getByText('My first note')).toBeVisible();

    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText('Trash is empty')).toBeVisible();

    await page.getByRole('button', { name: 'All Notes' }).click();
    await expect(page.getByText('My first note')).toBeVisible();

    // ---- Trash again, then permanently delete ----
    await page.getByText('My first note').click();
    await page.getByTitle('More options').click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();

    await page.getByRole('button', { name: 'Trash' }).click();
    await expect(page.getByText('My first note')).toBeVisible();

    await page.getByRole('button', { name: 'Delete forever' }).click();
    const purgeDialog = page.getByRole('dialog');
    await expect(purgeDialog).toBeVisible();
    await purgeDialog.getByRole('button', { name: 'Delete forever' }).click();

    await expect(page.getByText('Trash is empty')).toBeVisible();

    const finalState = await page.evaluate(async () => {
      const active = await window.storyNoteAPI.notes.list();
      const trashed = await window.storyNoteAPI.notes.listTrashed();
      return {
        active: active.ok ? active.data.length : -1,
        trashed: trashed.ok ? trashed.data.length : -1,
      };
    });
    expect(finalState).toEqual({ active: 0, trashed: 0 });
  } finally {
    await cleanup();
  }
});

// Regression test for a bug a code review caught: the autosave debounce
// (600ms) only cleared its pending timeout on unmount, never flushed it —
// so switching notes right after typing silently discarded the edit. Fixed
// with an unmount-flush effect in EditorPanel.tsx; this proves it actually
// works by switching notes well inside the debounce window and confirming
// the edit still made it to the database.
test('switching notes immediately after typing does not lose the edit (autosave flush on unmount)', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();

    // A second note to switch to — created first so it's already in the list.
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Note B');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data.length : 0;
      })
      .toBe(1);

    // The note under test.
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Note A — edited');

    // Switch away *immediately* — well inside the 600ms autosave debounce —
    // instead of waiting for it to fire on its own.
    await page.getByText('Note B').click();
    await expect(page.getByPlaceholder('Untitled')).toHaveValue('Note B');

    const persisted = await page.evaluate(() => window.storyNoteAPI.notes.list());
    expect(persisted.ok).toBe(true);
    if (persisted.ok) {
      const noteA = persisted.data.find((note) => note.title.startsWith('Note A'));
      expect(noteA?.title).toBe('Note A — edited');
    }
  } finally {
    await cleanup();
  }
});

// Same regression as above, but for the TipTap content body specifically —
// Phase 4 replaced the plain-textarea content path the previous test
// exercises (via the title input) with TipTap's onUpdate callback feeding
// the same scheduleSave()/unmount-flush mechanism. A code review flagged
// that the original regression test only covered the title's path, and
// Phase 4 changed content's path enough (uncontrolled TipTap state instead
// of a controlled textarea) that it needed its own explicit coverage.
test('switching notes immediately after typing in the editor body does not lose the edit', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();

    // A second note to switch to.
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Note B');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data.length : 0;
      })
      .toBe(1);

    // The note under test — type into the TipTap body, not the title.
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Note C');
    await page.locator('.tiptap').click();
    await page.keyboard.type('Body text typed right before switching notes.');

    // Switch away *immediately* — well inside the 600ms autosave debounce.
    await page.getByText('Note B').click();
    await expect(page.getByPlaceholder('Untitled')).toHaveValue('Note B');

    const persisted = await page.evaluate(() => window.storyNoteAPI.notes.list());
    expect(persisted.ok).toBe(true);
    if (persisted.ok) {
      const noteC = persisted.data.find((note) => note.title === 'Note C');
      expect(noteC?.content_plain).toBe('Body text typed right before switching notes.');
    }
  } finally {
    await cleanup();
  }
});
