import { expect, test } from '@playwright/test';
import { launchIsolatedApp } from './testHelpers';

// Exercises Phase 6's checklist through the real UI: switching views widens
// the note list and hides the editor pane (except Trash, which always keeps
// the Sidebar layout), each view renders its own markup, and the choice
// persists via window.storyNoteAPI.settings (last_view). The view switcher
// is a single icon button that cycles sidebar -> list -> details -> grid ->
// largegrid -> sidebar (not a <select>), matching Sidebar.tsx's theme toggle.
test('view switcher changes layout, renders each view, and persists the choice', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('First note');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data.length : 0;
      })
      .toBe(1);

    const viewToggle = page.getByTitle(/^View: /);
    await expect(viewToggle).toHaveAttribute('title', 'View: Sidebar (click to change)');
    // Sidebar view: editor pane visible alongside the note list.
    await expect(page.getByPlaceholder('Untitled')).toBeVisible();

    // ---- List view: full-width rows, no inline editor ----
    // Regression coverage: "First note" is already the active note from
    // being auto-selected on creation above — switching views must show
    // the fresh List listing here, not jump straight into the full-screen
    // note overlay just because some note happened to already be active.
    await viewToggle.click();
    await expect(viewToggle).toHaveAttribute('title', 'View: List (click to change)');
    await expect(page.getByPlaceholder('Untitled')).toBeHidden();
    await expect(page.getByText('First note')).toBeVisible();

    // Selecting a note from a view with no inline list-alongside-editor
    // layout opens it full-screen (list hides, editor shows, a Back button
    // appears) WITHOUT changing the view preference itself — it used to
    // force `view` back to 'sidebar', silently overwriting the user's
    // actual choice just from clicking a note (the bug this covers). The
    // listing (and its toolbar, including viewToggle) unmounts while the
    // note is open full-screen, so viewToggle isn't queried again until
    // after Back — this is expected, not a leftover bug.
    await page.getByText('First note').click();
    await expect(page.getByPlaceholder('Untitled')).toHaveValue('First note');
    // "First note" as plain text content (the list row) is gone — the only
    // remaining place it appears is the title <input>'s value, which
    // getByText doesn't match.
    await expect(page.getByText('First note', { exact: true })).toHaveCount(0);
    const backButton = page.getByTitle('Back to list');
    await expect(backButton).toBeVisible();

    // Back returns to the List listing — still List view (the preference
    // was never touched by opening/closing the note), editor hidden again.
    await backButton.click();
    await expect(page.getByPlaceholder('Untitled')).toBeHidden();
    await expect(page.getByText('First note')).toBeVisible();
    await expect(viewToggle).toHaveAttribute('title', 'View: List (click to change)');

    // ---- Details view: a table with Title/Label/Modified/Created ----
    await viewToggle.click(); // list -> details
    await expect(viewToggle).toHaveAttribute('title', 'View: Details (click to change)');
    await expect(page.getByRole('columnheader', { name: 'Title' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'First note' })).toBeVisible();
    await expect(page.getByPlaceholder('Untitled')).toBeHidden();

    // ---- Grid view ----
    await viewToggle.click();
    await expect(viewToggle).toHaveAttribute('title', 'View: Grid (click to change)');
    await expect(page.getByText('First note')).toBeVisible();
    await expect(page.getByPlaceholder('Untitled')).toBeHidden();

    // ---- Large Grid view ----
    await viewToggle.click();
    await expect(viewToggle).toHaveAttribute('title', 'View: Large Grid (click to change)');
    await expect(page.getByText('First note')).toBeVisible();
    await expect(page.getByPlaceholder('Untitled')).toBeHidden();

    const persisted = await page.evaluate(() => window.storyNoteAPI.settings.get('last_view'));
    expect(persisted).toEqual({ ok: true, data: 'largegrid' });

    // ---- Trash always keeps the Sidebar layout regardless of `view` ----
    await page.getByRole('button', { name: 'Trash' }).click();
    await expect(viewToggle).toBeDisabled();
    await expect(
      page.getByText('Trashed notes can be restored or permanently deleted'),
    ).toBeVisible();
  } finally {
    await cleanup();
  }
});

// Regression test for a bug a code review caught: switching the Sidebar
// filter (All Notes/Archived/Trash — a separate component that stays
// mounted even while NoteList.tsx is hidden by the full-screen note
// overlay) while a note was open full-screen cleared useNoteStore's
// activeNoteId (setFilter's existing behavior) without clearing
// useUIStore's isNoteDetailOpen. EditorPanel.tsx's visibility guard only
// checked isNoteDetailOpen, so it fell through to its "Select a note..."
// placeholder instead of returning null — rendering that placeholder
// alongside NoteList.tsx's now-correctly-visible listing (which has its own
// activeNoteId !== null defense) as two split flex-1 panels sharing the
// pane, instead of just the listing. Fixed by requiring the same
// !activeNote condition in EditorPanel.tsx's guard that NoteList.tsx
// already had.
test('switching Sidebar filter while a note is open full-screen shows a clean listing, not a stray placeholder', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('Note to open full-screen');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data.length : 0;
      })
      .toBe(1);

    await page.getByTitle(/^View: /).click(); // sidebar -> list
    await page.getByText('Note to open full-screen').click(); // open full-screen
    await expect(page.getByTitle('Back to list')).toBeVisible();

    // Switch filter via Sidebar nav (not the (now-hidden) view toggle or
    // Back button) while the note is still open full-screen.
    await page.getByRole('button', { name: 'Archived' }).click();

    // The archived listing shows cleanly — no stray "Select a note..."
    // placeholder split alongside it, and the view toggle (part of
    // NoteList.tsx's toolbar) is visible again, confirming the listing
    // — not some half-hidden/half-placeholder state — is what's showing.
    await expect(page.getByText('Select a note to view it here')).toHaveCount(0);
    await expect(page.getByText('Archived notes will show up here.')).toBeVisible();
    await expect(page.getByTitle(/^View: /)).toHaveAttribute(
      'title',
      'View: List (click to change)',
    );
  } finally {
    await cleanup();
  }
});

// Regression test for a bug a manual check caught: NoteList.tsx's outer
// <section> applied Tailwind's shrink-0 unconditionally, which fought
// flex-1's implicit flex-shrink:1 once List/Details/Grid views made it
// flex-1 — the pane could grow to fill space but never shrink below its
// content's natural width. At a narrow window width that meant the toolbar
// buttons and row text weren't truncating/reflowing, just getting silently
// clipped by App.tsx's overflow-hidden with no visible scrollbar. Fixed by
// making shrink-0 conditional (only in the fixed-width Sidebar state) and
// adding min-w-0 in the flexible state, which is what actually lets a flex
// item shrink below its content's intrinsic width.
test('list view reflows instead of clipping at a narrow window width', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('A reasonably long note title for this test');
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.storyNoteAPI.notes.list());
        return result.ok ? result.data.length : 0;
      })
      .toBe(1);

    await page.getByTitle(/^View: /).click(); // sidebar -> list

    // 760 is electron/main.ts's BrowserWindow minWidth (added for item 4 —
    // below that, no CSS reflow strategy keeps the 3-pane layout usable) —
    // this is as narrow as the window can actually get, and List view's
    // own reflow (this test's actual subject) still needs to hold up right
    // at that floor.
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(760, 500);
    });

    // scrollWidth<=clientWidth and Playwright's toBeVisible() both stay
    // green even in the broken state — App.tsx's root overflow-hidden clips
    // the overflowing content before it ever reaches
    // document.documentElement's scroll metrics (that clipping *is* the
    // bug), and toBeVisible() only checks CSS visibility/display plus a
    // non-empty bounding box, not whether an ancestor clipped the element
    // out of the actual viewport. Assert directly on each button's
    // getBoundingClientRect() against window.innerWidth instead — in the
    // pre-fix state this genuinely fails (the buttons render real estate
    // well past the right edge of a 380px window).
    const fitsInViewport = (locator: ReturnType<typeof page.getByTitle>): Promise<boolean> =>
      locator.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.right <= window.innerWidth;
      });

    // "New note" also names the Sidebar footer's button; .nth(1) is
    // NoteList's own toolbar button, the one actually inside the pane this
    // bug clipped (matches the disambiguation already used elsewhere in
    // this e2e suite for the same two-button naming collision).
    await expect.poll(() => fitsInViewport(page.getByTitle(/^View: /))).toBe(true);
    await expect
      .poll(() => fitsInViewport(page.getByRole('button', { name: 'New note' }).nth(1)))
      .toBe(true);
  } finally {
    await cleanup();
  }
});

// Regression test for a second instance of the same bug class, found while
// auditing the rest of the app for item 4 ("make the entire app responsive,
// not just List view"): Sidebar.tsx and NoteList.tsx's Sidebar-view branch
// were BOTH permanently rigid (shrink-0) at 240px and 320px respectively —
// together needing 560px before EditorPanel got squeezed, with neither pane
// able to give up any space to reflow. storynote-ui-reference.html's own
// .sidebar rule already specifies min-width:180px (shrinkable by default,
// no flex-shrink:0) — this app's Sidebar.tsx had deviated from that. Fixed
// by making both panes genuinely shrinkable down to a floor (Sidebar to
// 180px per the reference; NoteList's Sidebar-view branch to 240px, matching
// the reference's own note-list-pane min-width, even though the reference's
// literal flex-shrink:0 there means that min-width is dead code in the
// reference itself — engaging it is the fix, not a reference mismatch).
test('sidebar view reflows both panes instead of clipping at the minimum window width', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();

    await page.getByRole('button', { name: '+ New label' }).click();
    await page.getByLabel('Name').fill('A Reasonably Long Label Name');
    await page.getByTitle('#16A34A').click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTitle('Edit label')).toBeVisible();

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByPlaceholder('Untitled').fill('A reasonably long note title for this test');

    // electron/main.ts's BrowserWindow minWidth — the narrowest the window
    // can actually get.
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(760, 500);
    });

    const fitsInViewport = (locator: ReturnType<typeof page.getByTitle>): Promise<boolean> =>
      locator.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.right <= window.innerWidth;
      });

    // Sidebar's own controls (theme toggle, New note) still fit.
    await expect.poll(() => fitsInViewport(page.getByTitle(/^Theme: /))).toBe(true);
    await expect
      .poll(() => fitsInViewport(page.getByRole('button', { name: 'New note' }).first()))
      .toBe(true);
    // NoteList's toolbar (view toggle, its own New note button) still fits.
    await expect.poll(() => fitsInViewport(page.getByTitle(/^View: /))).toBe(true);
    await expect
      .poll(() => fitsInViewport(page.getByRole('button', { name: 'New note' }).nth(1)))
      .toBe(true);

    // Long text truncates with an ellipsis rather than being clipped with
    // no visual indication anything is cut off.
    await expect(page.getByText('A Reasonably Long Label Name')).toHaveCSS(
      'text-overflow',
      'ellipsis',
    );
  } finally {
    await cleanup();
  }
});

// Regression test for a distinct bug found in the same audit: EditorPanel's
// label-chip button (rounded-full) had no truncation on the label name text
// — a long name wrapped across multiple lines inside the pill instead of
// staying on one line, and since rounded-full's radius is relative to the
// element's own height, the growing height turned the chip into a
// distorted circular blob instead of a compact pill.
test('a long label name stays a single-line pill in the full-screen editor topbar, not a wrapped blob', async () => {
  const { app, cleanup } = await launchIsolatedApp();

  try {
    const page = await app.firstWindow();

    await page.getByRole('button', { name: '+ New label' }).click();
    await page.getByLabel('Name').fill('An Extremely Long Label Name For This Regression Test');
    await page.getByTitle('#E11D48').click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTitle('Edit label')).toBeVisible();

    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.getByRole('button', { name: 'Label', exact: true }).click();
    await page
      .getByRole('button', { name: 'An Extremely Long Label Name For This Regression Test' })
      .last()
      .click();

    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(760, 500);
    });

    // The label name also names the Sidebar's own "Edit label" row; .last()
    // is the editor topbar's chip (same DOM-order disambiguation used
    // elsewhere in this suite).
    const chip = page
      .getByRole('button', { name: 'An Extremely Long Label Name For This Regression Test' })
      .last();
    // A single-line pill stays well under ~30px tall regardless of the
    // window width; the pre-fix wrapped state measured ~44px tall (2 lines)
    // at this same window size — narrower windows wrap further still.
    const height = await chip.evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeLessThan(40);
  } finally {
    await cleanup();
  }
});
