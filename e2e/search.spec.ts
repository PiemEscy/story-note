import { expect, test } from '@playwright/test';
import { launchIsolatedApp } from './testHelpers';

// Phase 7's "global search input" — the Sidebar's search box is always
// mounted regardless of filter/view, so typing into it from anywhere in the
// app narrows the note list to matches against title/content_plain.
//
// FR-5.3 (locked-note content excluded from search previews) is covered at
// the IPC-handler level (electron/ipc/searchHandlers.test.ts) instead of
// here — there's no UI to lock a note yet (that's Phase 8), so this suite
// has no way to reach that state through the real app.
test('typing in the sidebar search narrows the list to title/content matches', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    const searchInput = page.getByPlaceholder('Search notes…');
    await expect(searchInput).toBeVisible();

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Roadmap 2026');
    await page.locator('.tiptap').fill('plan the Q3 launch');

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Grocery list');
    await page.locator('.tiptap').fill('milk, eggs, bread');

    // Search reads from the database, not the in-memory note list — wait for
    // both notes' 600ms autosave debounce to actually flush (same pattern as
    // notes-crud.spec.ts) before relying on their content being searchable.
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        if (!result.ok) return [];
        return result.data.map((n) => `${n.title}::${n.content_plain}`).sort();
      })
      .toEqual(['Grocery list::milk, eggs, bread', 'Roadmap 2026::plan the Q3 launch']);

    // Matches by title.
    await searchInput.fill('roadmap');
    await expect(page.getByText('Roadmap 2026')).toBeVisible();
    await expect(page.getByText('Grocery list')).toHaveCount(0);

    // Matches by body content_plain too.
    await searchInput.fill('eggs');
    await expect(page.getByText('Grocery list')).toBeVisible();
    await expect(page.getByText('Roadmap 2026')).toHaveCount(0);

    // No match — shows the empty state, not a stale/full list.
    await searchInput.fill('nonexistent search term');
    await expect(page.getByText('No matches')).toBeVisible();

    // Clearing the query restores the normal All Notes list.
    await searchInput.fill('');
    await expect(page.getByText('Roadmap 2026')).toBeVisible();
    await expect(page.getByText('Grocery list')).toBeVisible();
  } finally {
    await cleanup();
  }
});

// FR-5.3's other half — search must never surface trashed notes, even as a
// stray match. searchNotes() (electron/db/notes.ts) enforces this with a
// deleted_at IS NULL clause; this confirms it end to end through the real UI.
test('search excludes soft-deleted (trashed) notes', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Trashed roadmap');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data[0]?.title : undefined;
      })
      .toBe('Trashed roadmap');

    await page.getByTitle('More options').click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('No notes yet')).toBeVisible();

    await page.getByPlaceholder('Search notes…').fill('roadmap');
    await expect(page.getByText('No matches')).toBeVisible();
    await expect(page.getByText('Trashed roadmap')).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

// Clicking Sidebar nav (a distinct navigation action) while a search is
// active should drop the search rather than leaving stale results shown
// under the wrong header — matches useNoteStore's setFilter/setLabelFilter,
// which both clear searchQuery.
test('navigating to a different filter clears an active search', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Roadmap 2026');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data[0]?.title : undefined;
      })
      .toBe('Roadmap 2026');

    const searchInput = page.getByPlaceholder('Search notes…');
    await searchInput.fill('roadmap');
    await expect(page.getByText('Roadmap 2026')).toBeVisible();

    await page.getByRole('button', { name: 'Archived' }).click();
    await expect(searchInput).toHaveValue('');
    await expect(page.getByText('Archived notes will show up here.')).toBeVisible();
  } finally {
    await cleanup();
  }
});
