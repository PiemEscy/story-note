import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SearchHighlight, searchHighlightPluginKey } from './searchHighlight';
import type { SearchHighlightState } from './searchHighlight';

function createEditor(content: string): Editor {
  return new Editor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] } }), SearchHighlight],
    content,
  });
}

function pluginState(editor: Editor): SearchHighlightState {
  return searchHighlightPluginKey.getState(editor.state)!;
}

// Reads the actual rendered DOM (TipTap's headless Editor still creates a
// real EditorView backed by jsdom here) rather than reaching into plugin
// internals — verifies the full decorations-to-DOM pipeline actually
// works, not just that the plugin state computed the right ranges.
function decorationClasses(editor: Editor): string[] {
  return Array.from(editor.view.dom.querySelectorAll('span[class*="search-match"]')).map(
    (el) => el.className,
  );
}

describe('SearchHighlight', () => {
  it('starts with no query and no matches', () => {
    const editor = createEditor('<p>hello world</p>');
    expect(pluginState(editor)).toEqual({ query: '', matches: [], currentIndex: -1 });
  });

  it('setSearchQuery finds every occurrence and selects the first as current', () => {
    const editor = createEditor('<p>cat sat cat mat cat</p>');
    editor.commands.setSearchQuery('cat');

    const state = pluginState(editor);
    expect(state.query).toBe('cat');
    expect(state.matches).toHaveLength(3);
    expect(state.currentIndex).toBe(0);
  });

  it('decorates every match, and marks only the current one distinctly', () => {
    const editor = createEditor('<p>cat sat cat</p>');
    editor.commands.setSearchQuery('cat');

    const classes = decorationClasses(editor);
    expect(classes).toEqual(['search-match search-match-current', 'search-match']);
  });

  it('goToNextMatch advances currentIndex and updates which decoration is current', () => {
    const editor = createEditor('<p>cat sat cat</p>');
    editor.commands.setSearchQuery('cat');

    editor.commands.goToNextMatch();

    expect(pluginState(editor).currentIndex).toBe(1);
    expect(decorationClasses(editor)).toEqual([
      'search-match',
      'search-match search-match-current',
    ]);
  });

  it('goToNextMatch wraps around from the last match to the first', () => {
    const editor = createEditor('<p>cat sat cat</p>');
    editor.commands.setSearchQuery('cat');
    editor.commands.goToNextMatch(); // -> index 1 (the last match)

    editor.commands.goToNextMatch(); // -> should wrap to 0

    expect(pluginState(editor).currentIndex).toBe(0);
  });

  it('goToPreviousMatch wraps around from the first match to the last', () => {
    const editor = createEditor('<p>cat sat cat</p>');
    editor.commands.setSearchQuery('cat');

    editor.commands.goToPreviousMatch();

    expect(pluginState(editor).currentIndex).toBe(1); // wrapped to the last match
  });

  it('returns false from next/previous when there are no matches', () => {
    const editor = createEditor('<p>hello world</p>');
    editor.commands.setSearchQuery('xyz');

    expect(editor.commands.goToNextMatch()).toBe(false);
    expect(editor.commands.goToPreviousMatch()).toBe(false);
  });

  it('setSearchQuery("") clears the query, matches, and decorations', () => {
    const editor = createEditor('<p>cat sat cat</p>');
    editor.commands.setSearchQuery('cat');
    expect(pluginState(editor).matches).toHaveLength(2);

    editor.commands.setSearchQuery('');

    expect(pluginState(editor)).toEqual({ query: '', matches: [], currentIndex: -1 });
    expect(decorationClasses(editor)).toEqual([]);
  });

  it('recomputes matches when the document is edited while a search is active', () => {
    const editor = createEditor('<p>cat sat mat</p>');
    editor.commands.setSearchQuery('cat');
    expect(pluginState(editor).matches).toHaveLength(1);

    // Type another "cat" at the end of the document.
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, ' cat');

    expect(pluginState(editor).query).toBe('cat'); // the query itself is untouched
    expect(pluginState(editor).matches).toHaveLength(2);
  });

  it('clamps currentIndex when an edit removes some matches outright', () => {
    const editor = createEditor('<p>cat sat cat</p>');
    editor.commands.setSearchQuery('cat');
    editor.commands.goToNextMatch(); // currentIndex -> 1 (the second "cat")

    // Replace the whole document with something that has only one match.
    editor.commands.setContent('<p>cat</p>');

    const state = pluginState(editor);
    expect(state.matches).toHaveLength(1);
    expect(state.currentIndex).toBe(0); // clamped back into range
  });

  it('never decorates a match spanning across two separate blocks', () => {
    const editor = createEditor('<p>end</p><p>starting</p>');
    editor.commands.setSearchQuery('dsta'); // only "findable" if blocks were naively concatenated

    expect(pluginState(editor).matches).toHaveLength(0);
  });
});
