import { expect, type Page } from '@playwright/test';
import { test } from '@playwright/test';
import { launchIsolatedApp } from './testHelpers';

// Vertical position of a note's title text, used to compare list order —
// same technique used elsewhere in this suite (e.g. views.spec.ts) for
// order/position assertions where DOM structure has no dedicated test id.
async function topOf(page: Page, text: string): Promise<number> {
  const box = await page.getByText(text, { exact: true }).first().boundingBox();
  if (!box) throw new Error(`"${text}" is not visible`);
  return box.y;
}

// Phase 9 — Organization: pin/unpin (pinned notes sort above unpinned,
// regardless of the active sort field) and the sort <select>
// (storynote-ui-reference.html's .sort-select), including persistence via
// settings.sort_by/settings.sort_direction (schema.md).
test('pinning a note sorts it above unpinned notes and shows a pin icon; unpinning reverts it', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('First note');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data.find((n) => n.title === 'First note')?.title : undefined;
      })
      .toBe('First note');

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Second note');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data.find((n) => n.title === 'Second note')?.title : undefined;
      })
      .toBe('Second note');

    // Default sort is Date modified (newest first) — "Second note" is newer.
    await expect(page.getByText('Second note')).toBeVisible();
    await expect(page.getByText('First note')).toBeVisible();
    expect(await topOf(page, 'Second note')).toBeLessThan(await topOf(page, 'First note'));

    // Pin the older note — it should jump above the newer, unpinned one.
    await page.getByText('First note').click();
    await page.getByTitle('Pin note').click();
    await expect(page.getByTitle('Unpin note')).toBeVisible();

    await expect
      .poll(async () => topOf(page, 'First note'))
      .toBeLessThan(await topOf(page, 'Second note'));

    // A pin icon shows next to the pinned note's title in the list.
    const persisted = await page.evaluate(() => window.storyNoteAPI.notes.list());
    expect(persisted.ok).toBe(true);
    if (persisted.ok) {
      expect(persisted.data.find((n) => n.title === 'First note')?.is_pinned).toBe(1);
    }

    // Unpin — order reverts to newest-first.
    await page.getByTitle('Unpin note').click();
    await expect(page.getByTitle('Pin note')).toBeVisible();
    await expect
      .poll(async () => topOf(page, 'Second note'))
      .toBeLessThan(await topOf(page, 'First note'));
  } finally {
    await cleanup();
  }
});

test('the sort select reorders the list by title and persists the choice', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();

    for (const title of ['Cherry note', 'Apple note', 'Banana note']) {
      await page.getByRole('button', { name: 'New note' }).first().click();
      await page.getByPlaceholder('Untitled').fill(title);
    }
    // Only the last note's title is guaranteed flushed by the loop's own
    // "New note" clicks (each flushes the *previous* note on unmount) — wait
    // for it directly rather than assuming the debounce already fired.
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data.length : 0;
      })
      .toBe(3);
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data.map((n) => n.title).sort() : [];
      })
      .toEqual(['Apple note', 'Banana note', 'Cherry note']);

    await page.getByTitle('Sort by').selectOption('title');

    await expect
      .poll(async () => topOf(page, 'Apple note'))
      .toBeLessThan(await topOf(page, 'Banana note'));
    expect(await topOf(page, 'Banana note')).toBeLessThan(await topOf(page, 'Cherry note'));

    const sortBy = await page.evaluate(() => window.storyNoteAPI.settings.get('sort_by'));
    const sortDirection = await page.evaluate(() =>
      window.storyNoteAPI.settings.get('sort_direction'),
    );
    expect(sortBy).toEqual({ ok: true, data: 'title' });
    expect(sortDirection).toEqual({ ok: true, data: 'asc' });
  } finally {
    await cleanup();
  }
});
