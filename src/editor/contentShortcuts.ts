import { Extension } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { sinkListItem, liftListItem } from '@tiptap/pm/schema-list';
import { buildTextIndex, findValidMatch, WORD_CHAR } from './textSearch';

export interface ContentShortcutDisplay {
  action: string;
  keybinding: string;
}

// Displayed in SettingsModal.tsx's "Keyboard shortcuts" section — kept next
// to the implementation below so the two can't drift out of sync. Approved
// list (Note Editor Updates phase): VS Code-style content shortcuts,
// reinterpreted for a block-based rich-text editor rather than a line-based
// code editor — see the doc comments below each command for what that means
// concretely, and Ctrl+D's own caveat (ProseMirror has no multi-cursor
// support, so this can only do a single-selection "jump to next match", not
// VS Code's actual add-a-cursor behavior).
export const CONTENT_SHORTCUTS: ContentShortcutDisplay[] = [
  { action: 'Select next occurrence', keybinding: 'Ctrl+D' },
  { action: 'Move block up', keybinding: 'Alt+↑' },
  { action: 'Move block down', keybinding: 'Alt+↓' },
  { action: 'Duplicate block above', keybinding: 'Shift+Alt+↑' },
  { action: 'Duplicate block below', keybinding: 'Shift+Alt+↓' },
  { action: 'Find in note', keybinding: 'Ctrl+f' },
  { action: 'Indent / nest list item', keybinding: 'Tab' },
  { action: 'Outdent / un-nest list item', keybinding: 'Shift+Tab' },
];

interface CommandProps {
  state: EditorState;
  dispatch?: (tr: Transaction) => void;
}

// --- Move / duplicate blocks ------------------------------------------
//
// Scoped to *top-level* blocks (direct children of the document — a
// paragraph, heading, list, or table as a whole) rather than VS Code's
// per-line granularity: TipTap's document is a tree of blocks, not lines,
// and reordering *within* a nested container (one list item inside a list,
// one row inside a table) needs different position math per container
// type. This covers the actual ask — reordering/duplicating chunks of
// content — without that added complexity.

export function getTopLevelBlock(state: EditorState): { pos: number; node: PMNode } | null {
  const { $from } = state.selection;
  if ($from.depth < 1) return null;
  return { pos: $from.before(1), node: $from.node(1) };
}

export function moveBlock(direction: 'up' | 'down') {
  return ({ state, dispatch }: CommandProps): boolean => {
    const current = getTopLevelBlock(state);
    if (!current) return false;

    const { doc } = state;
    const index = doc.resolve(current.pos).index(0);
    const siblingIndex = direction === 'up' ? index - 1 : index + 1;
    if (siblingIndex < 0 || siblingIndex >= doc.childCount) return false;
    const sibling = doc.child(siblingIndex);

    // The two blocks are always adjacent — replace the exact range they
    // together span with the same two nodes in swapped order, rather than
    // a separate delete + insert (whose second position would have to
    // account for the first step having already shifted the document).
    const rangeStart = direction === 'up' ? current.pos - sibling.nodeSize : current.pos;
    const rangeEnd = rangeStart + current.node.nodeSize + sibling.nodeSize;
    const newOrder = direction === 'up' ? [current.node, sibling] : [sibling, current.node];

    if (dispatch) {
      const tr = state.tr.replaceWith(rangeStart, rangeEnd, newOrder);
      // Keep the cursor with the block that moved, at its new position.
      const movedBlockStart = direction === 'up' ? rangeStart : rangeStart + sibling.nodeSize;
      tr.setSelection(TextSelection.near(tr.doc.resolve(movedBlockStart + 1)));
      dispatch(tr);
    }
    return true;
  };
}

export function duplicateBlock(direction: 'above' | 'below') {
  return ({ state, dispatch }: CommandProps): boolean => {
    const current = getTopLevelBlock(state);
    if (!current) return false;

    if (dispatch) {
      const insertPos = direction === 'above' ? current.pos : current.pos + current.node.nodeSize;
      const copy = current.node.copy(current.node.content);
      const tr = state.tr.insert(insertPos, copy);
      // Cursor lands at the end of the new copy's content, not its start —
      // ready to keep typing after it, the same way finishing a line and
      // pressing Enter would feel.
      tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + copy.nodeSize - 1)));
      dispatch(tr);
    }
    return true;
  };
}

// --- Select next occurrence --------------------------------------------
//
// buildTextIndex/findValidMatch (textSearch.ts) built fresh on every Ctrl+D
// press rather than cached: documents here are short enough (a single
// note) that this is cheap, and caching would need invalidating on every
// edit anyway.
//
// Exported for unit testing — the position-mapping/search logic is the
// part most prone to subtle off-by-one bugs, so it's worth verifying in
// isolation against a real ProseMirror doc rather than only through a full
// keyboard-driven e2e pass.
export function selectNextOccurrenceCommand({ state, dispatch }: CommandProps): boolean {
  const { from, to, empty } = state.selection;
  const { text, positions } = buildTextIndex(state.doc);
  if (positions.length === 0) return false;

  if (empty) {
    // No selection yet — select the word under (or immediately after) the
    // cursor, matching VS Code's own first-press behavior.
    let flatIndex = positions.indexOf(from);
    if (flatIndex === -1) flatIndex = positions.findIndex((p) => p >= from);
    if (flatIndex === -1) return false;

    let start = flatIndex;
    while (start > 0 && WORD_CHAR.test(text[start - 1])) start--;
    let end = flatIndex;
    while (end < text.length && WORD_CHAR.test(text[end])) end++;
    if (start === end) return false; // landed on whitespace/punctuation

    if (dispatch) {
      const selFrom = positions[start];
      const selTo = positions[end - 1] + 1;
      dispatch(state.tr.setSelection(TextSelection.create(state.doc, selFrom, selTo)));
    }
    return true;
  }

  // A selection already exists — jump to the next occurrence of its text,
  // wrapping back to the start of the document if nothing follows it.
  // Only reliable for a selection within a single block — doc.textBetween's
  // default (no block separator) can't be told apart from real adjacent
  // text if the selection itself spans a boundary, so a mismatched/failed
  // find here (rather than a wrong one) is the acceptable outcome.
  const searchTerm = state.doc.textBetween(from, to);
  if (!searchTerm) return false;

  // `to` often lands on a "gap after the last real character" (the end of
  // a selection, or a block boundary) rather than any character's own
  // tracked start position, in which case indexOf(to) fails to find it —
  // falling back to 0 there (instead of the nearest tracked position at or
  // after it) would restart the search from the very beginning and just
  // re-find the selection's own current occurrence as if it were "next".
  const exactFlat = positions.indexOf(to);
  const searchFromFlat = exactFlat !== -1 ? exactFlat : positions.findIndex((p) => p >= to);
  let foundAt = findValidMatch(
    text,
    positions,
    searchTerm,
    searchFromFlat === -1 ? text.length : searchFromFlat,
  );
  if (foundAt === -1) {
    const wrapped = findValidMatch(text, positions, searchTerm, 0);
    // With only one occurrence in the whole document, wrapping around just
    // re-finds the current selection itself — not a genuine "next" one, so
    // treat that the same as finding nothing.
    foundAt = wrapped !== positions.indexOf(from) ? wrapped : -1;
  }
  if (foundAt === -1) return false;

  if (dispatch) {
    const selFrom = positions[foundAt];
    const selTo = positions[foundAt + searchTerm.length - 1] + 1;
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, selFrom, selTo)));
  }
  return true;
}

// --- Tab / Shift-Tab: indent / outdent ---------------------------------
//
// Without a handler here, Tab falls through to the browser's default
// contentEditable behavior — moving DOM focus to the next focusable element
// (a toolbar button) instead of doing anything to the note content. This
// extension's keymap plugin runs *before* @tiptap/extension-table's and
// @tiptap/extension-list's own (see useNoteEditor.ts's extension order —
// TipTap builds one ProseMirror keymap plugin per extension, earlier-
// registered extensions ending up later in the merged, reversed plugin
// list), so both need explicit handling here rather than being left to run
// on their own:
//  - Inside a table cell, Table already binds Tab/Shift-Tab to cell
//    navigation (goToNextCell/goToPreviousCell) — step aside by returning
//    false so its own, later-checked binding gets a chance to run.
//  - Inside a list item, replicate sinkListItem/liftListItem (the same
//    commands @tiptap/extension-list's ListItem binds Tab/Shift-Tab to)
//    rather than deferring to it, since this handler runs first regardless.
//  - Anywhere else, there's no block-level "indent" concept in this schema
//    (no blockquote/indent node), so Tab inserts a fixed run of
//    non-breaking spaces — plain spaces would collapse under this app's
//    normal CSS white-space handling, but U+00A0 always renders — and
//    Shift-Tab removes a trailing run of them immediately before the
//    cursor, if there is one. Both always return true (never false) here,
//    so the key is swallowed either way and never reaches the DOM's
//    default focus-navigation behavior.
const INDENT_UNIT = '\u00A0\u00A0\u00A0\u00A0';

function isInsideTable(state: EditorState): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === 'table') return true;
  }
  return false;
}

export function indentCommand({ state, dispatch }: CommandProps): boolean {
  if (isInsideTable(state)) return false;

  const { listItem } = state.schema.nodes;
  if (listItem && sinkListItem(listItem)(state, dispatch)) return true;

  if (dispatch) dispatch(state.tr.insertText(INDENT_UNIT));
  return true;
}

export function outdentCommand({ state, dispatch }: CommandProps): boolean {
  if (isInsideTable(state)) return false;

  const { listItem } = state.schema.nodes;
  if (listItem && liftListItem(listItem)(state, dispatch)) return true;

  const { $from } = state.selection;
  const textBefore = $from.parent.textBetween(0, $from.parentOffset);
  const trailingIndent = /[\u00A0 ]+$/.exec(textBefore);
  if (trailingIndent && dispatch) {
    const removeLength = Math.min(trailingIndent[0].length, INDENT_UNIT.length);
    dispatch(state.tr.delete($from.pos - removeLength, $from.pos));
  }
  return true;
}

// Scoped to note content automatically: TipTap's addKeyboardShortcuts only
// fires while the editor itself has focus, so this never intercepts these
// keys anywhere else in the app (a plain window keydown listener would).
export const ContentShortcuts = Extension.create({
  name: 'contentShortcuts',

  addKeyboardShortcuts() {
    return {
      'Mod-d': () => this.editor.commands.command(selectNextOccurrenceCommand),
      'Alt-ArrowUp': () => this.editor.commands.command(moveBlock('up')),
      'Alt-ArrowDown': () => this.editor.commands.command(moveBlock('down')),
      'Shift-Alt-ArrowUp': () => this.editor.commands.command(duplicateBlock('above')),
      'Shift-Alt-ArrowDown': () => this.editor.commands.command(duplicateBlock('below')),
      Tab: () => this.editor.commands.command(indentCommand),
      'Shift-Tab': () => this.editor.commands.command(outdentCommand),
    };
  },
});
