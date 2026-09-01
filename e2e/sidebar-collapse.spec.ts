import { expect, test } from '@playwright/test';
import { createIsolatedUserData, launchIsolatedApp } from './testHelpers';
import { IPC_CHANNELS } from '../electron/ipc/channels';

// Sidebar collapse-to-icon-rail. No storynote-ui-reference.html markup to
// match — this is new UI, not something the reference demonstrates.

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

test('collapsing the sidebar hides text labels but keeps icons; expanding restores them', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    // Scoped to <aside> throughout — NoteList.tsx's own toolbar heading
    // shows the current filter's name ("All Notes") too, so an unscoped
    // getByText('All Notes') would be ambiguous between the two. Not
    // exact-matched: the nav button's own text content is "All Notes" plus
    // a trailing note count once noteCounts has loaded ("All Notes1"), so
    // an exact match is a race against that load rather than a reliable
    // check either way.
    const sidebar = page.locator('aside');

    // Branding is gone — replaced entirely by the toggle. Text assertions
    // below use getByText (literal rendered text), not getByRole's name
    // matching — a button's accessible name falls back to its `title`
    // attribute even with no visible text, which would make a
    // getByRole(..., { name }) check pass whether or not the label text
    // itself is actually still on screen.
    await expect(sidebar.getByText('StoryNote', { exact: true })).toHaveCount(0);
    // sidebarCollapsed starts false: the toggle's own title says what
    // clicking it will do next ("Collapse sidebar" while expanded).
    await expect(sidebar.getByTitle('Collapse sidebar')).toBeVisible();
    await expect(sidebar.getByText('All Notes')).toBeVisible();
    await expect(sidebar.getByText('Labels', { exact: true })).toBeVisible();
    await expect(sidebar.getByText('Settings', { exact: true })).toBeVisible();

    const widthBefore = (await sidebar.boundingBox())?.width ?? 0;

    await sidebar.getByTitle('Collapse sidebar').click();

    // Text is gone; the icon-bearing controls are still there, just
    // icon-only now (title attributes carry the label instead). The
    // toggle's title flips to "Expand sidebar" now that it's collapsed.
    await expect(sidebar.getByTitle('Expand sidebar')).toBeVisible();
    await expect(sidebar.getByText('All Notes')).toHaveCount(0);
    await expect(sidebar.getByTitle('All Notes')).toBeVisible();
    await expect(sidebar.getByText('Labels', { exact: true })).toHaveCount(0);
    await expect(sidebar.getByText('Settings', { exact: true })).toHaveCount(0);
    await expect(sidebar.getByTitle('Settings')).toBeVisible();

    await expect
      .poll(async () => (await sidebar.boundingBox())?.width)
      .toBeLessThan(widthBefore - 50);

    await sidebar.getByTitle('Expand sidebar').click();

    await expect(sidebar.getByTitle('Collapse sidebar')).toBeVisible();
    await expect(sidebar.getByText('All Notes')).toBeVisible();
    await expect(sidebar.getByText('Labels', { exact: true })).toBeVisible();
    await expect
      .poll(async () => (await sidebar.boundingBox())?.width)
      .toBeGreaterThan(widthBefore - 10);
  } finally {
    await cleanup();
  }
});

test('collapsing the sidebar keeps a created label reachable as its color dot', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    const sidebar = page.locator('aside');

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

    await sidebar.getByTitle('Collapse sidebar').click();
    await expect(sidebar.getByTitle('Expand sidebar')).toBeVisible();

    // The section header text is gone, but the label's own "icon" — its
    // color dot — stays reachable, unlike the rest of the Labels section.
    await expect(sidebar.getByText('Labels', { exact: true })).toHaveCount(0);
    await expect(sidebar.getByText('Work', { exact: true })).toHaveCount(0);
    const collapsedLabelDot = sidebar.getByTitle('Work');
    await expect(collapsedLabelDot).toBeVisible();

    // Still filters the note list, same as clicking the expanded row does
    // (labels-and-theme.spec.ts's own filter test, reused here collapsed).
    await collapsedLabelDot.click();
    await expect(page.getByRole('heading', { name: 'Work', exact: true })).toBeVisible();
    await expect(page.getByText('Work note')).toBeVisible();
    await expect(page.getByText('Unlabeled note')).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test('collapsed state persists across a restart', async () => {
  const isolated = createIsolatedUserData();
  let app = await isolated.launch();

  try {
    const page = await app.firstWindow();
    const sidebar = page.locator('aside');
    await sidebar.getByTitle('Collapse sidebar').click();
    await expect(sidebar.getByTitle('Expand sidebar')).toBeVisible();

    await app.close();
    app = await isolated.launch();
    const page2 = await app.firstWindow();
    const sidebar2 = page2.locator('aside');

    await expect(sidebar2.getByTitle('Expand sidebar')).toBeVisible();
    await expect(sidebar2.getByText('All Notes')).toHaveCount(0);
  } finally {
    await app.close();
    await isolated.cleanup();
  }
});

test('clicking the search icon while collapsed expands the sidebar and focuses search', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    const sidebar = page.locator('aside');
    await sidebar.getByTitle('Collapse sidebar').click();
    await expect(sidebar.getByTitle('Expand sidebar')).toBeVisible();

    await sidebar.getByTitle('Search notes').click();

    // Expanded again — the toggle's title flips back once collapse clears.
    await expect(sidebar.getByTitle('Collapse sidebar')).toBeVisible();
    const searchInput = sidebar.getByPlaceholder('Search notes…');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toBeFocused();
  } finally {
    await cleanup();
  }
});

test('the global search shortcut expands a collapsed sidebar and focuses search', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    const sidebar = page.locator('aside');
    await sidebar.getByTitle('Collapse sidebar').click();
    await expect(sidebar.getByTitle('Expand sidebar')).toBeVisible();

    await sendShortcut(app, 'focus-search');

    await expect(sidebar.getByTitle('Collapse sidebar')).toBeVisible();
    const searchInput = sidebar.getByPlaceholder('Search notes…');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toBeFocused();
  } finally {
    await cleanup();
  }
});

test('the global search shortcut just focuses search when the sidebar is already expanded', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    const sidebar = page.locator('aside');
    await expect(sidebar.getByTitle('Collapse sidebar')).toBeVisible();

    await sendShortcut(app, 'focus-search');

    // Still expanded — the shortcut didn't toggle anything, just focused.
    await expect(sidebar.getByTitle('Collapse sidebar')).toBeVisible();
    await expect(sidebar.getByPlaceholder('Search notes…')).toBeFocused();
  } finally {
    await cleanup();
  }
});
