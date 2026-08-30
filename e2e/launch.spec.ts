import { expect, test } from '@playwright/test';
import { launchIsolatedApp } from './testHelpers';

// Scaffold smoke test only — real user-flow specs (create note, lock/unlock,
// search, tray) land alongside their features in later phases.
test('launches and shows the StoryNote window', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const window = await app.firstWindow();
    await expect(window).toHaveTitle('StoryNote');
  } finally {
    await cleanup();
  }
});
