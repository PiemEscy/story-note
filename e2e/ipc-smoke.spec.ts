import { expect, test } from '@playwright/test';
import { launchIsolatedApp } from './testHelpers';

// Proves the real end-to-end path works: sandboxed preload exposes
// window.storyNoteAPI via contextBridge, an IPC round-trip through the
// actual registered main-process handlers succeeds, and results come back
// in the { ok, data } shape — not just "the app didn't crash on launch"
// (launch.spec.ts) but "a renderer can actually talk to the database
// through the real security boundary" (contextIsolation + sandbox, both
// enabled on the BrowserWindow).
test('renderer can call window.storyNoteAPI through the sandboxed preload', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    // Named `page`, not `window` — an evaluate() callback's `window`
    // reference must resolve to the browser global, not get shadowed by
    // this outer variable.
    const page = await app.firstWindow();
    await expect(page).toHaveTitle('StoryNote');

    const listResult = await page.evaluate(() => window.storyNoteAPI.notes.list());
    expect(listResult).toEqual({ ok: true, data: [] });

    const createResult = await page.evaluate(() =>
      window.storyNoteAPI.notes.create({ title: 'e2e smoke note' }),
    );
    expect(createResult.ok).toBe(true);

    const listAfterCreate = await page.evaluate(() => window.storyNoteAPI.notes.list());
    expect(listAfterCreate.ok).toBe(true);
    if (listAfterCreate.ok) {
      expect(listAfterCreate.data).toHaveLength(1);
      expect(listAfterCreate.data[0].title).toBe('e2e smoke note');
      // the security-review fix: password_hash must never cross the wire
      expect(listAfterCreate.data[0]).not.toHaveProperty('password_hash');
    }

    // malformed input should come back as a clean { ok: false }, not throw
    // in the renderer or crash the main process
    const malformed = await page.evaluate(() =>
      // @ts-expect-error — deliberately malformed for this test
      window.storyNoteAPI.notes.get('not-a-number'),
    );
    expect(malformed.ok).toBe(false);
  } finally {
    await cleanup();
  }
});
