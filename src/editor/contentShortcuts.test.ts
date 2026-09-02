import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { buildTextIndex } from './textSearch';
import {
  selectNextOccurrenceCommand,
  moveBlock,
  duplicateBlock,
  indentCommand,
  outdentCommand,
} from './contentShortcuts';

// A minimal editor with just StarterKit — enough to build real paragraph/
// heading nodes and a real EditorState, without needing the table/
// placeholder extensions useNoteEditor.ts also configures for the app.
function createEditor(content: string): Editor {
  return new Editor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] } })],
    content,
  });
}

// Mirrors useNoteEditor.ts's own Table setup — only indentCommand/
// outdentCommand's "step aside inside a table" branch needs this.
function createEditorWithTable(content: string): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content,
  });
}

function childText(editor: Editor, index: number): string {
  return editor.state.doc.child(index).textContent;
}

describe('selectNextOccurrenceCommand', () => {
  it('selects the word under the cursor when nothing is selected', () => {
    const editor = createEditor('<p>hello world</p>');
    editor.commands.setTextSelection(9); // inside "world"
    const applied = editor.commands.command(selectNextOccurrenceCommand);
    expect(applied).toBe(true);
    const { from, to } = editor.state.selection;
    expect(editor.state.doc.textBetween(from, to)).toBe('world');
  });

  it('does nothing when the cursor touches no word on either side', () => {
    // A cursor immediately after "hello" (before the space) still touches
    // "hello" itself; a literal double space would test the same thing,
    // but HTML parsing collapses consecutive whitespace before it ever
    // reaches TipTap, so punctuation is used instead — the comma isn't a
    // word character, so a cursor right after it (before the space) has
    // no word character adjacent on either side.
    const editor = createEditor('<p>hello, world</p>');
    editor.commands.setTextSelection(7); // between "," and " "
    const applied = editor.commands.command(selectNextOccurrenceCommand);
    expect(applied).toBe(false);
  });

  it('extends an existing selection to the next occurrence of the same text', () => {
    const editor = createEditor('<p>cat sat cat mat cat</p>');
    editor.commands.setTextSelection({ from: 1, to: 4 }); // first "cat"
    expect(editor.state.doc.textBetween(1, 4)).toBe('cat');

    const applied = editor.commands.command(selectNextOccurrenceCommand);
    expect(applied).toBe(true);
    const { from, to } = editor.state.selection;
    expect(editor.state.doc.textBetween(from, to)).toBe('cat');
    expect(from).toBeGreaterThan(4);
  });

  it('wraps around to the first occurrence once past the last one', () => {
    const editor = createEditor('<p>cat sat cat</p>');
    editor.commands.setTextSelection({ from: 9, to: 12 }); // the second "cat"
    expect(editor.state.doc.textBetween(9, 12)).toBe('cat');

    const applied = editor.commands.command(selectNextOccurrenceCommand);
    expect(applied).toBe(true);
    const { from, to } = editor.state.selection;
    expect(editor.state.doc.textBetween(from, to)).toBe('cat');
    expect(from).toBe(1); // wrapped back to the first "cat"
  });

  it('never matches across a block boundary', () => {
    // Flat-concatenated (no boundary handling) this would read
    // "end" + "starting" = "endstarting", which contains "dsta" even
    // though nothing contiguous in the real document says that.
    const editor = createEditor('<p>end</p><p>starting</p>');
    editor.commands.setTextSelection({ from: 1, to: 1 });
    const { text } = buildTextIndex(editor.state.doc);
    expect(text).toBe('end\nstarting');

    editor.commands.setTextSelection({ from: 2, to: 4 }); // "nd" at the end of the first block
    const applied = editor.commands.command(selectNextOccurrenceCommand);
    expect(applied).toBe(false); // "nd" doesn't recur anywhere real
  });
});

describe('moveBlock', () => {
  it('swaps the current block with the previous one', () => {
    const editor = createEditor('<p>first</p><p>second</p>');
    editor.commands.setTextSelection(9); // inside "second"

    const applied = editor.commands.command(moveBlock('up'));

    expect(applied).toBe(true);
    expect(childText(editor, 0)).toBe('second');
    expect(childText(editor, 1)).toBe('first');
    // Cursor follows the moved block (now first).
    expect(editor.state.doc.textBetween(0, editor.state.selection.from).length).toBeLessThan(7);
  });

  it('swaps the current block with the next one', () => {
    const editor = createEditor('<p>first</p><p>second</p>');
    editor.commands.setTextSelection(3); // inside "first"

    const applied = editor.commands.command(moveBlock('down'));

    expect(applied).toBe(true);
    expect(childText(editor, 0)).toBe('second');
    expect(childText(editor, 1)).toBe('first');
  });

  it('does nothing when moving the first block up', () => {
    const editor = createEditor('<p>first</p><p>second</p>');
    editor.commands.setTextSelection(3);
    const before = editor.state.doc.toJSON();

    const applied = editor.commands.command(moveBlock('up'));

    expect(applied).toBe(false);
    expect(editor.state.doc.toJSON()).toEqual(before);
  });

  it('does nothing when moving the last block down', () => {
    const editor = createEditor('<p>first</p><p>second</p>');
    editor.commands.setTextSelection(9);
    const before = editor.state.doc.toJSON();

    const applied = editor.commands.command(moveBlock('down'));

    expect(applied).toBe(false);
    expect(editor.state.doc.toJSON()).toEqual(before);
  });

  it('reorders a heading and a paragraph the same as two paragraphs', () => {
    const editor = createEditor('<h2>Title</h2><p>Body text</p>');
    editor.commands.setTextSelection(2); // inside "Title"

    const applied = editor.commands.command(moveBlock('down'));

    expect(applied).toBe(true);
    expect(childText(editor, 0)).toBe('Body text');
    expect(childText(editor, 1)).toBe('Title');
    expect(editor.state.doc.child(1).type.name).toBe('heading');
  });
});

describe('duplicateBlock', () => {
  it('inserts a copy above the current block, cursor following the copy', () => {
    const editor = createEditor('<p>only</p>');
    editor.commands.setTextSelection(2);

    const applied = editor.commands.command(duplicateBlock('above'));

    expect(applied).toBe(true);
    expect(editor.state.doc.childCount).toBe(2);
    expect(childText(editor, 0)).toBe('only');
    expect(childText(editor, 1)).toBe('only');
    expect(editor.state.selection.from).toBeLessThan(editor.state.doc.child(0).nodeSize);
  });

  it('inserts a copy below the current block, cursor following the copy', () => {
    const editor = createEditor('<p>only</p>');
    editor.commands.setTextSelection(2);

    const applied = editor.commands.command(duplicateBlock('below'));

    expect(applied).toBe(true);
    expect(editor.state.doc.childCount).toBe(2);
    expect(childText(editor, 0)).toBe('only');
    expect(childText(editor, 1)).toBe('only');
    expect(editor.state.selection.from).toBeGreaterThanOrEqual(editor.state.doc.child(0).nodeSize);
  });
});

describe('indentCommand', () => {
  it('inserts a run of non-breaking spaces at the cursor outside a list', () => {
    const editor = createEditor('<p>hello</p>');
    editor.commands.setTextSelection(6); // end of "hello"

    const applied = editor.commands.command(indentCommand);

    expect(applied).toBe(true);
    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size)).toBe(
      'hello\u00A0\u00A0\u00A0\u00A0',
    );
  });

  it('sinks the current list item under its previous sibling', () => {
    const editor = createEditor('<ul><li><p>first</p></li><li><p>second</p></li></ul>');
    const list = editor.state.doc.child(0);
    expect(list.childCount).toBe(2);
    editor.commands.setTextSelection(editor.state.doc.content.size - 2); // inside "second"

    const applied = editor.commands.command(indentCommand);

    expect(applied).toBe(true);
    const outerList = editor.state.doc.child(0);
    expect(outerList.childCount).toBe(1); // "second" is no longer a top-level item
    const firstItem = outerList.child(0);
    expect(firstItem.lastChild?.type.name).toBe('bulletList'); // nested under "first"
  });

  it('steps aside inside a table, leaving the document untouched', () => {
    const editor = createEditorWithTable('');
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: false });
    editor.commands.setTextSelection(3); // inside the first cell
    const before = editor.state.doc.toJSON();

    const applied = editor.commands.command(indentCommand);

    expect(applied).toBe(false);
    expect(editor.state.doc.toJSON()).toEqual(before);
  });
});

describe('outdentCommand', () => {
  it('removes a trailing run of indent characters before the cursor', () => {
    const editor = createEditor('<p>hello</p>');
    editor.commands.setTextSelection(6);
    editor.commands.command(indentCommand); // "hello" + 4 NBSP

    const applied = editor.commands.command(outdentCommand);

    expect(applied).toBe(true);
    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size)).toBe('hello');
  });

  it('does nothing (but still reports handled) when there is no indent to remove', () => {
    const editor = createEditor('<p>hello</p>');
    editor.commands.setTextSelection(6);
    const before = editor.state.doc.toJSON();

    const applied = editor.commands.command(outdentCommand);

    expect(applied).toBe(true);
    expect(editor.state.doc.toJSON()).toEqual(before);
  });

  it('lifts a nested list item back out to the parent list', () => {
    const editor = createEditor('<ul><li><p>first</p><ul><li><p>nested</p></li></ul></li></ul>');
    editor.commands.setTextSelection(editor.state.doc.content.size - 2); // inside "nested"

    const applied = editor.commands.command(outdentCommand);

    expect(applied).toBe(true);
    const outerList = editor.state.doc.child(0);
    expect(outerList.childCount).toBe(2); // "first" and "nested" are now siblings
  });

  it('steps aside inside a table, leaving the document untouched', () => {
    const editor = createEditorWithTable('');
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: false });
    editor.commands.setTextSelection(3); // inside the first cell
    const before = editor.state.doc.toJSON();

    const applied = editor.commands.command(outdentCommand);

    expect(applied).toBe(false);
    expect(editor.state.doc.toJSON()).toEqual(before);
  });
});
