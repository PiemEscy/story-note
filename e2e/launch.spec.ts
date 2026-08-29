import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'path';

// Scaffold smoke test only — real user-flow specs (create note, lock/unlock,
// search, tray) land alongside their features in later phases.
test('launches and shows the StoryNote window', async () => {
  const app = await electron.launch({ args: [join(__dirname, '../out/main/index.js')] });
  const window = await app.firstWindow();

  await expect(window).toHaveTitle('StoryNote');

  await app.close();
});
