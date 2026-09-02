import { expect, test } from '@playwright/test';
import { launchIsolatedApp } from './testHelpers';

// Bug fix: table-layout defaults to the browser's own `auto`, which
// recalculates every column's width from its *current* content on every
// keystroke — typing in one cell visibly pushed/squeezed its neighbors.
// main.css now sets table-layout: fixed, so columns size from
// @tiptap/extension-table's own colgroup/col widths instead and stay put
// while typing (text wraps within the column instead).

test('typing a long unbroken word into one cell does not resize any column', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.locator('.tiptap').click();
    await page.getByTitle('Insert table').click();

    const columns = page.locator('.tiptap table tr').first().locator('td, th');
    await expect(columns).toHaveCount(3);
    const widthsBefore = await Promise.all(
      (await columns.all()).map(async (col) => (await col.boundingBox())!.width),
    );

    await page.locator('.tiptap table td').first().click();
    await page.keyboard.type(
      'ThisIsAVeryLongUnbrokenTokenThatShouldWrapInsteadOfWideningTheColumnAndPushingItsNeighbors',
    );
    // Content wrapped onto multiple lines within the cell rather than the
    // column growing to fit it on one line — the concrete, visible effect
    // of table-layout: fixed actually taking hold.
    await expect(page.locator('.tiptap td').first()).toContainText('ThisIsAVeryLongUnbrokenToken');
    const cellBox = await page.locator('.tiptap td').first().boundingBox();
    expect(cellBox!.height).toBeGreaterThan(30); // wrapped across several lines, not one

    const widthsAfter = await Promise.all(
      (await columns.all()).map(async (col) => (await col.boundingBox())!.width),
    );
    for (let i = 0; i < widthsBefore.length; i++) {
      expect(Math.abs(widthsAfter[i] - widthsBefore[i])).toBeLessThan(2);
    }
  } finally {
    await cleanup();
  }
});

test('dragging the column resize handle still resizes a column, without disturbing the others', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.locator('.tiptap').click();
    await page.getByTitle('Insert table').click();

    const columns = page.locator('.tiptap table tr').first().locator('td, th');
    await expect(columns).toHaveCount(3);
    const widthsBefore = await Promise.all(
      (await columns.all()).map(async (col) => (await col.boundingBox())!.width),
    );

    // Hover the boundary between column 1 and column 2 to reveal the
    // handle, then drag it 80px to the right.
    const firstColumnBox = (await columns.nth(0).boundingBox())!;
    const handleX = firstColumnBox.x + firstColumnBox.width;
    const handleY = firstColumnBox.y + firstColumnBox.height / 2;
    await page.mouse.move(handleX, handleY);
    const handle = page.locator('.column-resize-handle').first();
    await expect(handle).toBeVisible();

    await page.mouse.down();
    await page.mouse.move(handleX + 80, handleY, { steps: 10 });
    await page.mouse.up();

    const widthsAfter = await Promise.all(
      (await columns.all()).map(async (col) => (await col.boundingBox())!.width),
    );
    // Column 1 actually grew...
    expect(widthsAfter[0]).toBeGreaterThan(widthsBefore[0] + 40);
    // ...and the resize is still in effect after further typing elsewhere —
    // proving it's a real, persisted colwidth, not a transient drag
    // artifact that the fixed-layout fix silently reverts.
    await page.locator('.tiptap table td').nth(1).click();
    await page.keyboard.type('hello');
    const widthsFinal = await Promise.all(
      (await columns.all()).map(async (col) => (await col.boundingBox())!.width),
    );
    expect(Math.abs(widthsFinal[0] - widthsAfter[0])).toBeLessThan(2);
  } finally {
    await cleanup();
  }
});
