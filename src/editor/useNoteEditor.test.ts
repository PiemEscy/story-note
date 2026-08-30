import { describe, expect, it } from 'vitest';
import { parseStoredContent } from './useNoteEditor';

describe('parseStoredContent', () => {
  it('returns an empty string for empty/missing content', () => {
    expect(parseStoredContent('')).toBe('');
  });

  it('parses a TipTap JSON document (has a "type" field) into an object', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
    const result = parseStoredContent(JSON.stringify(doc));
    expect(result).toEqual(doc);
  });

  it('falls back to the raw string for legacy plain-text notes (invalid JSON)', () => {
    expect(parseStoredContent('Just some plain text from before Phase 4')).toBe(
      'Just some plain text from before Phase 4',
    );
  });

  it('falls back to the raw string for JSON that parses but is not a TipTap doc shape', () => {
    // valid JSON, but no "type" field — e.g. a stray array or plain object
    expect(parseStoredContent('{"foo":"bar"}')).toBe('{"foo":"bar"}');
    expect(parseStoredContent('[1,2,3]')).toBe('[1,2,3]');
  });

  it('falls back to the raw string for plain text that happens to look numeric or boolean-ish', () => {
    // valid JSON primitives, but not an object with a "type" field
    expect(parseStoredContent('42')).toBe('42');
    expect(parseStoredContent('true')).toBe('true');
  });
});
