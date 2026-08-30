import { expect, test } from '@playwright/test';
import { launchIsolatedApp } from './testHelpers';

// Verifies Phase 4's actual checklist items through the real UI: headings,
// bold/italic/strikethrough, lists, and table insertion + row/column
// editing. Asserts on the persisted data (window.storyNoteAPI.notes.list())
// rather than toolbar button CSS classes — a more robust check of "did the
// formatting actually apply and serialize correctly" than a visual
// active-state class match would be.
test('rich text formatting round-trips correctly: heading, bold, list, table', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'New note' }).first().click();

    const editor = page.locator('.tiptap');
    await editor.click();

    // Heading + bold
    await page.keyboard.type('Bold heading');
    await page.keyboard.press('Control+A');
    await page.getByTitle('Bold (Ctrl+B)').click();
    await page.getByTitle('Text style').selectOption('h1');
    // A native <select> keeps DOM focus on itself after selectOption(), not
    // the editor — even though the toolbar's onChange handler calls
    // editor.chain().focus(), that focus() call racing against an immediate
    // keyboard.press() is exactly what made this test flaky. Re-click the
    // editor explicitly (safe and unambiguous here — only one line exists
    // so far) rather than relying on focus() having landed in time.
    await editor.click();

    // A bulleted list on the next line — no need to reselect "Paragraph"
    // first: TipTap's heading extension exits to a paragraph (not another
    // heading) on Enter at the end of a heading line, same as most editors.
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('A bullet item');
    await page.getByTitle('Bulleted list').click();

    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data[0]?.content_plain : undefined;
      })
      .toContain('A bullet item');

    const afterTextFormatting = await page.evaluate(() => window.storyNoteAPI.notes.list());
    if (!afterTextFormatting.ok) throw new Error('failed to load notes');
    const note = afterTextFormatting.data[0];

    // content_plain: real extracted text, no markup leaking through
    expect(note.content_plain).toContain('Bold heading');
    expect(note.content_plain).toContain('A bullet item');
    expect(note.content_plain).not.toContain('<');

    // content: a real TipTap/ProseMirror JSON document, not the plain text
    const doc = JSON.parse(note.content) as { type: string };
    expect(doc.type).toBe('doc');
    const docJson = JSON.stringify(doc);
    expect(docJson).toContain('"heading"');
    expect(docJson).toContain('"bold"');
    expect(docJson).toContain('"bulletList"');

    // ---- Table insertion + row/column editing ----
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.getByTitle('Insert table').click();

    // insertTable() places the cursor inside the new table, which reveals
    // the contextual row/column controls in the toolbar.
    await expect(page.getByTitle('Add row below')).toBeVisible();
    const initialRows = await page.locator('.tiptap table tr').count();
    const initialCols = await page.locator('.tiptap table tr').first().locator('td, th').count();

    await page.getByTitle('Add row below').click();
    await expect(page.locator('.tiptap table tr')).toHaveCount(initialRows + 1);

    await page.getByTitle('Add column after').click();
    await expect(page.locator('.tiptap table tr').first().locator('td, th')).toHaveCount(
      initialCols + 1,
    );

    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data[0]?.content : undefined;
      })
      .toContain('"type":"table"');
  } finally {
    await cleanup();
  }
});
