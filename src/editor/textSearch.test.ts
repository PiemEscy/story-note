import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { buildTextIndex, findAllMatches } from './textSearch';

function createEditor(content: string): Editor {
  return new Editor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] } })],
    content,
  });
}

describe('buildTextIndex', () => {
  it('concatenates text across blocks with a boundary sentinel between them', () => {
    const editor = createEditor('<p>foo</p><p>bar</p>');
    const { text, positions } = buildTextIndex(editor.state.doc);
    expect(text).toBe('foo\nbar');
    expect(positions[3]).toBe(-1);
  });

  it('maps each flat-text index back to the real document position of that character', () => {
    const editor = createEditor('<p>hello</p>');
    const { positions } = buildTextIndex(editor.state.doc);
    expect(editor.state.doc.textBetween(positions[0], positions[0] + 1)).toBe('h');
    expect(editor.state.doc.textBetween(positions[4], positions[4] + 1)).toBe('o');
  });
});

describe('findAllMatches', () => {
  it('returns an empty array for an empty query', () => {
    const editor = createEditor('<p>hello world</p>');
    expect(findAllMatches(editor.state.doc, '')).toEqual([]);
  });

  it('finds every non-overlapping occurrence, as real document positions', () => {
    const editor = createEditor('<p>cat sat cat mat cat</p>');
    const matches = findAllMatches(editor.state.doc, 'cat');
    expect(matches).toHaveLength(3);
    for (const { from, to } of matches) {
      expect(editor.state.doc.textBetween(from, to)).toBe('cat');
    }
    // In document order, not overlapping.
    expect(matches[0].from).toBeLessThan(matches[1].from);
    expect(matches[1].from).toBeLessThan(matches[2].from);
  });

  it('never matches across a block boundary', () => {
    const editor = createEditor('<p>end</p><p>starting</p>');
    // Flat-concatenated with no boundary handling this would read
    // "end" + "starting" = "endstarting", which contains "dsta".
    expect(findAllMatches(editor.state.doc, 'dsta')).toEqual([]);
  });

  it('finds a real match spanning multiple marks within the same block', () => {
    const editor = createEditor('<p><strong>foo</strong>bar</p>');
    const matches = findAllMatches(editor.state.doc, 'oobar');
    expect(matches).toHaveLength(1);
    expect(editor.state.doc.textBetween(matches[0].from, matches[0].to)).toBe('oobar');
  });

  it('finds no matches when the query does not occur', () => {
    const editor = createEditor('<p>hello world</p>');
    expect(findAllMatches(editor.state.doc, 'xyz')).toEqual([]);
  });

  it('is case-insensitive by default', () => {
    const editor = createEditor('<p>The Cat sat. the cat ran.</p>');
    const matches = findAllMatches(editor.state.doc, 'cat');
    expect(matches).toHaveLength(2);
    expect(editor.state.doc.textBetween(matches[0].from, matches[0].to)).toBe('Cat');
    expect(editor.state.doc.textBetween(matches[1].from, matches[1].to)).toBe('cat');
  });

  it('is case-sensitive when explicitly requested', () => {
    const editor = createEditor('<p>The Cat sat. the cat ran.</p>');
    const matches = findAllMatches(editor.state.doc, 'cat', { caseSensitive: true });
    expect(matches).toHaveLength(1);
    expect(editor.state.doc.textBetween(matches[0].from, matches[0].to)).toBe('cat');
  });
});
