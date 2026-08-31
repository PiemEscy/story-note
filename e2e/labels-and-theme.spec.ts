import { expect, test } from '@playwright/test';
import { launchIsolatedApp } from './testHelpers';

// Exercises Phase 5's checklist through the real UI: create a label with a
// color, assign it to a note, edit and delete it — plus the theme toggle,
// which persists through window.storyNoteAPI.settings and applies to
// document.documentElement.dataset.theme.
//
// Label rows use title="Edit label" as a tooltip alongside visible text (the
// label's own name) — getByRole('button', { name }) would resolve to the
// label's name, not the title, so these use getByTitle throughout (same
// reasoning as "More options"/"New note" elsewhere in this e2e suite).
test('label create/assign/edit/delete round-trips through the real UI', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();

    // ---- Create a label ----
    await page.getByRole('button', { name: '+ New label' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await modal.getByLabel('Name').fill('Work');
    await modal.getByTitle('#2563EB').click(); // blue swatch
    await modal.getByRole('button', { name: 'Save' }).click();
    await expect(modal).toBeHidden();

    await expect(page.getByTitle('Edit label')).toBeVisible();
    await expect(page.getByText('Work')).toBeVisible();

    const afterCreate = await page.evaluate(() => window.storyNoteAPI.labels.list());
    expect(afterCreate.ok).toBe(true);
    if (!afterCreate.ok) throw new Error('unreachable');
    expect(afterCreate.data).toHaveLength(1);
    expect(afterCreate.data[0]).toMatchObject({ name: 'Work', color: '#2563EB' });
    const labelId = afterCreate.data[0].id;

    // ---- Assign it to a note ----
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Rollout notes');
    await page.getByRole('button', { name: 'Label', exact: true }).click();
    // "Work" also names the sidebar's label row (App.tsx renders Sidebar
    // before EditorPanel, so .last() is the label-picker dropdown's entry).
    await page.getByRole('button', { name: 'Work' }).last().click();

    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data[0]?.label_id : undefined;
      })
      .toBe(labelId);

    // ---- Edit the label ----
    await page.getByTitle('Edit label').click();
    await expect(modal).toBeVisible();
    await modal.getByLabel('Name').fill('Work Stuff');
    await modal.getByRole('button', { name: 'Save' }).click();
    await expect(modal).toBeHidden();
    // "Work Stuff" now names both the sidebar row and the editor's label
    // chip — .first() is enough here, this only checks it rendered somewhere.
    await expect(page.getByText('Work Stuff').first()).toBeVisible();

    // ---- Delete the label — the note's label_id clears via ON DELETE SET NULL ----
    await page.getByTitle('Edit label').click();
    await modal.getByRole('button', { name: 'Delete', exact: true }).click();
    await modal.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(modal).toBeHidden();
    await expect(page.getByTitle('Edit label')).toHaveCount(0);

    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data[0]?.label_id : undefined;
      })
      .toBeNull();
  } finally {
    await cleanup();
  }
});

// Regression coverage for a post-review fix: clicking a Sidebar label row
// used to open the edit-label modal (a code review comment flagged this as
// wrong — it should behave like clicking All Notes/Archived/Trash and
// filter the note list instead). Editing moved to a separate pencil icon
// (title="Edit label", already exercised by the test above).
test('clicking a Sidebar label filters the note list, same as clicking All Notes', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();

    await page.getByRole('button', { name: '+ New label' }).click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel('Name').fill('Work');
    await modal.getByTitle('#16A34A').click();
    await modal.getByRole('button', { name: 'Save' }).click();
    await expect(modal).toBeHidden();

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Work note');
    await page.getByRole('button', { name: 'Label', exact: true }).click();
    await page.getByRole('button', { name: 'Work' }).last().click();

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Unlabeled note');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data.length : 0;
      })
      .toBe(2);

    // Click the label's own body (not the pencil edit icon) — no modal
    // should open, and the list should narrow to just the labeled note.
    await page.getByText('Work', { exact: true }).click();
    await expect(modal).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Work', exact: true })).toBeVisible();
    await expect(page.getByText('Work note')).toBeVisible();
    await expect(page.getByText('Unlabeled note')).toHaveCount(0);

    // Clicking a built-in nav item (same interaction pattern) clears the
    // label filter and shows everything again.
    await page.getByRole('button', { name: 'All Notes' }).click();
    await expect(page.getByText('Work note')).toBeVisible();
    await expect(page.getByText('Unlabeled note')).toBeVisible();
  } finally {
    await cleanup();
  }
});

// Sidebar's nav-item/label-item counts (storynote-ui-reference.html's
// .nav-count, e.g. "All Notes 128") — a code review comment asked for these
// to be added, matching the reference's styling/placement.
test('sidebar shows accurate All Notes/Archived/Trash/label counts, kept live across actions', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();

    // Nav items: the count is still the button's own last <span> (icon is
    // an <svg>, not a <span>, so it's unambiguous).
    const countFor = (name: string | RegExp): Promise<string | null> =>
      page.getByRole('button', { name }).first().locator('span').last().textContent();

    // Label rows: the count sits *outside* the filter button (a sibling
    // after the edit-icon button, so the pencil icon reads to its left —
    // see Sidebar.tsx), not inside it — walk up to the row and grab its
    // last descendant <span> instead. .first(): a label name also names
    // the editor topbar's label-chip once a note has that label assigned
    // (App.tsx renders Sidebar before EditorPanel, so .first() is always
    // the Sidebar row — same disambiguation used elsewhere in this suite).
    const labelCountFor = (name: string): Promise<string | null> =>
      page
        .getByRole('button', { name, exact: true })
        .first()
        .locator('xpath=..')
        .locator('span')
        .last()
        .textContent();

    await expect(page.getByRole('button', { name: /^All Notes/ })).toBeVisible();
    await expect.poll(() => countFor(/^All Notes/)).toBe('0');
    await expect.poll(() => countFor(/^Archived/)).toBe('0');
    await expect.poll(() => countFor(/^Trash/)).toBe('0');

    await page.getByRole('button', { name: '+ New label' }).click();
    await page.getByLabel('Name').fill('Work');
    await page.getByTitle('#16A34A').click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTitle('Edit label')).toBeVisible();

    // A new, labeled note bumps All Notes and the label's own count.
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Work note');
    await page.getByRole('button', { name: 'Label', exact: true }).click();
    await page.getByRole('button', { name: 'Work' }).last().click();
    await expect.poll(() => countFor(/^All Notes/)).toBe('1');
    await expect.poll(() => labelCountFor('Work')).toBe('1');

    // Archiving moves the count from All Notes to Archived, and drops the
    // label's own count (labelFilter only ever scopes the active list).
    await page.getByTitle('More options').click();
    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect.poll(() => countFor(/^All Notes/)).toBe('0');
    await expect.poll(() => countFor(/^Archived/)).toBe('1');
    await expect.poll(() => labelCountFor('Work')).toBe('0');
  } finally {
    await cleanup();
  }
});

test('theme toggle cycles system -> light -> dark and persists the choice', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    const toggle = page.getByTitle(/^Theme: /);
    await expect(toggle).toBeVisible();

    const readTheme = (): Promise<string | undefined> =>
      page.evaluate(() => document.documentElement.dataset.theme);
    const initial = await readTheme();
    expect(['light', 'dark']).toContain(initial);

    await toggle.click(); // -> light
    await expect(toggle).toHaveAttribute('title', 'Theme: Light (click to change)');
    await expect.poll(readTheme).toBe('light');

    await toggle.click(); // -> dark
    await expect(toggle).toHaveAttribute('title', 'Theme: Dark (click to change)');
    await expect.poll(readTheme).toBe('dark');

    const persisted = await page.evaluate(() => window.storyNoteAPI.settings.get('theme'));
    expect(persisted).toEqual({ ok: true, data: 'dark' });
  } finally {
    await cleanup();
  }
});
