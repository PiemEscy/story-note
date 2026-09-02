import { expect, test } from '@playwright/test';
import { launchIsolatedApp, createIsolatedUserData } from './testHelpers';

// Note Editor Updates — header restructure, note-content settings (font
// family/size, zoom, content width), and the VS Code-style content
// shortcuts. The shortcuts' own command logic (position math, block
// swapping, word-boundary detection) is unit-tested directly against a
// real ProseMirror EditorState in src/editor/contentShortcuts.test.ts —
// what's worth verifying here is that a real keypress in the running app
// actually reaches that logic through the DOM, scoped to the editor.

test('note header shows Label beside a stacked Title/Details block, above the toolbar', async () => {
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
    await page.getByPlaceholder('Untitled').fill('Header layout check');
    await page.getByRole('button', { name: 'Label', exact: true }).click();
    await page.getByRole('button', { name: 'Work' }).last().click();

    const header = page.locator('section').filter({ has: page.getByPlaceholder('Untitled') });
    const label = header.getByRole('button', { name: 'Work' });
    const title = header.getByPlaceholder('Untitled');
    const details = header.getByText(/Created .* · Modified/);

    await expect(label).toBeVisible();
    await expect(title).toHaveValue('Header layout check');
    await expect(details).toBeVisible();

    // Label sits to the left of the title/details block (DOM order, and
    // this app has no RTL support so that's also left-to-right on screen).
    // Details sits directly *below* the title, left-aligned with it (a
    // follow-up fix from the original single-line "Title — Details") —
    // not to its right, and not indented further than it.
    const labelBox = await label.boundingBox();
    const titleBox = await title.boundingBox();
    const detailsBox = await details.boundingBox();
    expect(labelBox!.x).toBeLessThan(titleBox!.x);
    expect(Math.abs(detailsBox!.x - titleBox!.x)).toBeLessThan(2);
    expect(detailsBox!.y).toBeGreaterThan(titleBox!.y);
    // Tight vertical spacing, not the wide horizontal gap this replaced —
    // details starts right after the title's own line, not floating well
    // below it.
    expect(detailsBox!.y - (titleBox!.y + titleBox!.height)).toBeLessThan(8);

    // Above the toolbar, not below it — toolbar sits below the header row
    // this all lives in.
    const toolbar = page.getByTitle('Bold (Ctrl+B)');
    const toolbarBox = await toolbar.boundingBox();
    expect(labelBox!.y).toBeLessThan(toolbarBox!.y);
  } finally {
    await cleanup();
  }
});

test('font size, zoom, and content width settings apply live and persist across a restart', async () => {
  const isolated = createIsolatedUserData();
  let app = await isolated.launch();

  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.locator('.tiptap').click();
    await page.keyboard.type('Sizing check');

    await page.getByTitle('Settings').click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });

    const fontSizeSlider = dialog.locator('input[type="range"]').nth(0);
    await fontSizeSlider.fill('20');
    await fontSizeSlider.dispatchEvent('input');
    await fontSizeSlider.dispatchEvent('change');

    const zoomSlider = dialog.locator('input[type="range"]').nth(1);
    await zoomSlider.fill('1.5');
    await zoomSlider.dispatchEvent('input');
    await zoomSlider.dispatchEvent('change');

    const widthSlider = dialog.locator('input[type="range"]').nth(2);
    await widthSlider.fill('600');
    await widthSlider.dispatchEvent('input');
    await widthSlider.dispatchEvent('change');

    await dialog.getByRole('button', { name: 'Close' }).click();

    const readVar = (name: string): Promise<string> =>
      page.evaluate((n) => document.documentElement.style.getPropertyValue(n), name);
    await expect.poll(() => readVar('--note-font-size')).toBe('20px');
    await expect.poll(() => readVar('--note-zoom')).toBe('1.5');
    await expect.poll(() => readVar('--note-content-width')).toBe('600px');

    await app.close();
    app = await isolated.launch();
    const page2 = await app.firstWindow();
    const readVar2 = (name: string): Promise<string> =>
      page2.evaluate((n) => document.documentElement.style.getPropertyValue(n), name);
    await expect.poll(() => readVar2('--note-font-size')).toBe('20px');
    await expect.poll(() => readVar2('--note-zoom')).toBe('1.5');
    await expect.poll(() => readVar2('--note-content-width')).toBe('600px');
  } finally {
    await app.close();
    await isolated.cleanup();
  }
});

test('zoom Reset button appears once changed and restores 100%', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await page.getByTitle('Settings').click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });

    await expect(dialog.getByRole('button', { name: 'Reset' })).toHaveCount(0);

    const zoomSlider = dialog.locator('input[type="range"]').nth(1);
    await zoomSlider.fill('1.3');
    await zoomSlider.dispatchEvent('input');
    await zoomSlider.dispatchEvent('change');

    const resetButton = dialog.getByRole('button', { name: 'Reset' });
    await expect(resetButton).toBeVisible();
    await resetButton.click();

    await expect(dialog.getByRole('button', { name: 'Reset' })).toHaveCount(0);
    const zoom = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--note-zoom'),
    );
    expect(zoom).toBe('1');
  } finally {
    await cleanup();
  }
});

test('font family preset applies to the CSS variable driving note content', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await page.getByTitle('Settings').click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });

    await dialog.getByRole('button', { name: 'Monospace' }).click();

    const fontFamily = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--note-font-family'),
    );
    expect(fontFamily).toBe('var(--font-mono)');
  } finally {
    await cleanup();
  }
});

test('Ctrl+D selects the word under the cursor in the editor', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.locator('.tiptap').click();
    await page.keyboard.type('hello world');
    await expect(page.locator('.tiptap')).toHaveText('hello world');

    // Keyboard input delivery to this Electron window is occasionally
    // flaky in this sandboxed test environment — verified separately that
    // it isn't specific to this shortcut: even a bare Home+ArrowRight
    // sometimes doesn't land before the very next press fires. Re-issuing
    // the presses inside expect.poll (rather than a fixed wait) retries
    // until the cursor genuinely lands where intended, without silently
    // masking an actual regression in the shortcut logic itself (which is
    // covered independently, and thoroughly, in contentShortcuts.test.ts).
    await expect
      .poll(async () => {
        await page.keyboard.press('Home');
        await page.keyboard.press('ArrowRight'); // land inside "hello"
        return page.evaluate(() => window.getSelection()?.anchorOffset);
      })
      .toBe(1);

    await expect
      .poll(async () => {
        await page.keyboard.press('Control+d');
        return page.evaluate(() => window.getSelection()?.toString());
      })
      .toBe('hello');
  } finally {
    await cleanup();
  }
});

test('Alt+ArrowUp moves the current block above the previous one', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.locator('.tiptap').click();
    await page.keyboard.type('First block');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Second block');

    // Cursor is at the end of "Second block" — move it above "First block".
    await page.keyboard.press('Alt+ArrowUp');

    const paragraphs = page.locator('.tiptap p');
    await expect(paragraphs.nth(0)).toHaveText('Second block');
    await expect(paragraphs.nth(1)).toHaveText('First block');
  } finally {
    await cleanup();
  }
});

test('Shift+Alt+ArrowDown duplicates the current block below it', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.locator('.tiptap').click();
    await page.keyboard.type('Duplicate me');

    await page.keyboard.press('Shift+Alt+ArrowDown');
    await page.keyboard.type(' (copy)');

    const paragraphs = page.locator('.tiptap p');
    await expect(paragraphs).toHaveCount(2);
    await expect(paragraphs.nth(0)).toHaveText('Duplicate me');
    await expect(paragraphs.nth(1)).toHaveText('Duplicate me (copy)');
  } finally {
    await cleanup();
  }
});

test('content shortcuts do not fire outside the editor (e.g. while the note title is focused)', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.locator('.tiptap').click();
    await page.keyboard.type('Body text');

    const titleInput = page.getByPlaceholder('Untitled');
    await titleInput.click();
    await titleInput.fill('hello world');
    await titleInput.press('Home');
    await titleInput.press('ArrowRight');

    // Ctrl+D is a TipTap keymap, only active while the editor itself has
    // focus — with the title input focused instead, this should be a
    // plain no-op (no browser-default binding to fight either).
    await page.keyboard.press('Control+d');

    await expect(titleInput).toHaveValue('hello world');
    const selectedText = await page.evaluate(() => window.getSelection()?.toString());
    expect(selectedText).toBe('');
  } finally {
    await cleanup();
  }
});
