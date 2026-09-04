import { existsSync } from 'fs';
import { expect, test } from '@playwright/test';
import { createIsolatedUserData } from './testHelpers';
import { getDatabasePath } from '../electron/db/getDatabasePath';

// Phase 13 — Packaging: "Verify first-launch flow: DB creation, default
// label, default settings." Every other e2e spec launches against a fresh
// temp userData dir too, so first-launch behavior is exercised implicitly
// throughout the suite — this spec is the one place it's asserted directly,
// against a genuinely empty profile (no notes/labels/settings rows), rather
// than relying on that being an incidental side effect of unrelated tests.
test('a brand-new profile creates its database and starts with no seeded rows', async () => {
  const isolated = createIsolatedUserData();

  expect(existsSync(getDatabasePath(isolated.userDataDir))).toBe(false);

  const app = await isolated.launch();

  try {
    const page = await app.firstWindow();
    await expect(page).toHaveTitle('StoryNote');

    // The encrypted db is created on first run, not lazily on first write.
    // storynote.keymeta.json (ADR-001) is deliberately *not* written here:
    // 'os' mode is the implicit default when the sidecar is absent
    // (keys.ts's readKeyMetadata), so a fresh install has nothing to persist
    // until the user actually switches modes.
    expect(existsSync(getDatabasePath(isolated.userDataDir))).toBe(true);

    // No migration seeds a starter label or any settings row — the app is
    // expected to apply sane in-code defaults (resolved theme, sidebar view,
    // null default-label) when these are absent, not require pre-seeded data.
    const labels = await page.evaluate(() => window.storyNoteAPI.labels.list());
    expect(labels.ok).toBe(true);
    if (labels.ok) expect(labels.data).toEqual([]);

    const settings = await page.evaluate(() => window.storyNoteAPI.settings.getAll());
    expect(settings.ok).toBe(true);
    if (settings.ok) expect(settings.data).toEqual({});

    const keyMode = await page.evaluate(() => window.storyNoteAPI.keyMode.get());
    expect(keyMode.ok).toBe(true);
    if (keyMode.ok) expect(keyMode.data).toBe('os');

    // The renderer's own defaults render correctly with nothing persisted
    // yet: empty-state copy (no notes), no label chip/filter to pick from.
    await expect(page.getByText('No notes yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New note' }).first()).toBeVisible();
  } finally {
    await app.close();
    await isolated.cleanup();
  }
});
