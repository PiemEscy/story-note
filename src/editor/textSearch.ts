import type { Node as PMNode } from '@tiptap/pm/model';

// Shared text-search infrastructure — a flat text index of a ProseMirror
// document, with a sentinel marking each block boundary so a match can
// never silently span across two separate blocks (e.g. the end of one
// paragraph and the start of the next getting concatenated into an
// accidental match with nothing visually contiguous about it). Originally
// built for contentShortcuts.ts's Ctrl+D ("select next occurrence"); reused
// as-is by searchHighlight.ts's Ctrl+F and global-search highlighting
// rather than duplicating this logic a second time.
export const BLOCK_BOUNDARY = -1;

export function buildTextIndex(doc: PMNode): { text: string; positions: number[] } {
  let text = '';
  const positions: number[] = [];

  doc.descendants((node, pos) => {
    if (node.isTextblock && text.length > 0) {
      text += '\n';
      positions.push(BLOCK_BOUNDARY);
    }
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) {
        positions.push(pos + i);
      }
      text += node.text;
    }
    return true;
  });

  return { text, positions };
}

export const WORD_CHAR = /[\p{L}\p{N}_]/u;

// Finds `term` in `text` at or after `fromIndex`, skipping any match that
// would cross a block boundary. Returns the flat-text index of the match,
// or -1 if none exists at or after `fromIndex`.
export function findValidMatch(
  text: string,
  positions: number[],
  term: string,
  fromIndex: number,
): number {
  let searchFrom = fromIndex;
  for (;;) {
    const found = text.indexOf(term, searchFrom);
    if (found === -1) return -1;
    const crossesBoundary = positions.slice(found, found + term.length).includes(BLOCK_BOUNDARY);
    if (!crossesBoundary) return found;
    searchFrom = found + 1;
  }
}

export interface MatchRange {
  from: number;
  to: number;
}

// Every non-overlapping occurrence of `query` in the document, as real
// ProseMirror positions — used by searchHighlight.ts to decorate every
// match at once (unlike Ctrl+D's own single "next occurrence" jump).
// Case-*insensitive* by default (unlike findValidMatch's own exact-text
// callers like Ctrl+D, which already has the exact selected text in hand)
// — matching the conventional default for a "find in note" feature, same
// as a browser's own Ctrl+F. Lowercasing text/query for the comparison
// only, never the returned ranges: they still index into the original
// `positions`, so this assumes case-folding doesn't change string length
// (true for the practical range of note content this app expects; a
// handful of Unicode edge cases like German ß→ss don't hold, and would
// just fail to match rather than return a wrong range).
export function findAllMatches(
  doc: PMNode,
  query: string,
  options?: { caseSensitive?: boolean },
): MatchRange[] {
  if (!query) return [];
  const caseSensitive = options?.caseSensitive ?? false;
  const { text, positions } = buildTextIndex(doc);
  const searchText = caseSensitive ? text : text.toLowerCase();
  const searchQuery = caseSensitive ? query : query.toLowerCase();
  const matches: MatchRange[] = [];
  let searchFrom = 0;
  for (;;) {
    const found = findValidMatch(searchText, positions, searchQuery, searchFrom);
    if (found === -1) break;
    matches.push({ from: positions[found], to: positions[found + searchQuery.length - 1] + 1 });
    searchFrom = found + searchQuery.length;
  }
  return matches;
}
