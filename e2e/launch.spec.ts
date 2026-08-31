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

// Regression test: below electron/main.ts's BrowserWindow minWidth/minHeight
// (760x360), no CSS reflow strategy keeps the 3-pane desktop layout usable —
// Sidebar view's three panes (Sidebar.tsx, NoteList.tsx's Sidebar-view
// branch, EditorPanel.tsx) need 720px combined even at their own minimum
// widths, before the layout genuinely can't fit. Added alongside making
// those panes shrinkable with real floors (they used to either be
// permanently rigid, or — EditorPanel.tsx's case — able to collapse to 0
// width entirely via flex-basis:0%, both clipping content with no way to
// see it or scroll to it at a narrow width) so the window itself can't be
// resized past the point where that reflow still holds up.
test('window cannot be resized below its minimum usable size', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(200, 200);
    });

    const size = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.getSize(),
    );

    expect(size?.[0]).toBeGreaterThanOrEqual(760);
    expect(size?.[1]).toBeGreaterThanOrEqual(360);
  } finally {
    await cleanup();
  }
});
