import { Extension } from '@tiptap/core';
import type { CommandProps } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { findAllMatches } from './textSearch';
import type { MatchRange } from './textSearch';

export interface SearchHighlightState {
  query: string;
  matches: MatchRange[];
  // -1 when there's a query but no matches (or no query at all) — never an
  // out-of-range index into `matches` otherwise.
  currentIndex: number;
}

export const searchHighlightPluginKey = new PluginKey<SearchHighlightState>('searchHighlight');

type SearchMeta = { type: 'setQuery'; query: string } | { type: 'setIndex'; currentIndex: number };

const EMPTY_STATE: SearchHighlightState = { query: '', matches: [], currentIndex: -1 };

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchHighlight: {
      setSearchQuery: (query: string) => ReturnType;
      goToNextMatch: () => ReturnType;
      goToPreviousMatch: () => ReturnType;
    };
  }
}

function withRecomputedMatches(state: SearchHighlightState, tr: Transaction): SearchHighlightState {
  if (!state.query) return state;
  const matches = findAllMatches(tr.doc, state.query);
  return {
    query: state.query,
    matches,
    // Keep pointing at roughly the same match (by index) rather than
    // resetting to the first one on every keystroke elsewhere in the
    // document — clamped since the edit may have removed matches outright.
    currentIndex: matches.length === 0 ? -1 : Math.min(state.currentIndex, matches.length - 1),
  };
}

// Read from React (EditorPanel/NoteSearchBar) via
// searchHighlightPluginKey.getState(editor.state) — there's no dedicated
// "get current search state" command since plugin state is already public
// through the key, and a command would just be a wrapper around the same
// getState call.
export const SearchHighlight = Extension.create({
  name: 'searchHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchHighlightState>({
        key: searchHighlightPluginKey,
        state: {
          init: () => EMPTY_STATE,
          apply(tr, prev) {
            const meta = tr.getMeta(searchHighlightPluginKey) as SearchMeta | undefined;
            if (meta?.type === 'setQuery') {
              return {
                query: meta.query,
                matches: findAllMatches(tr.doc, meta.query),
                currentIndex: meta.query ? 0 : -1,
              };
            }
            if (meta?.type === 'setIndex') {
              return { ...prev, currentIndex: meta.currentIndex };
            }
            // The document itself changed (typing, a move/duplicate
            // shortcut, etc.) while a search is active — matches need to
            // stay accurate against the new content, not the old positions.
            if (tr.docChanged) return withRecomputedMatches(prev, tr);
            return prev;
          },
        },
        props: {
          decorations(state) {
            const pluginState = searchHighlightPluginKey.getState(state);
            if (!pluginState || pluginState.matches.length === 0) return null;
            const decorations = pluginState.matches.map((match, index) =>
              Decoration.inline(match.from, match.to, {
                class:
                  index === pluginState.currentIndex
                    ? 'search-match search-match-current'
                    : 'search-match',
              }),
            );
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      setSearchQuery:
        (query: string) =>
        ({ tr, dispatch }: CommandProps) => {
          if (dispatch) {
            dispatch(tr.setMeta(searchHighlightPluginKey, { type: 'setQuery', query }));
          }
          return true;
        },
      goToNextMatch:
        () =>
        ({ state, tr, dispatch }: CommandProps) => {
          const pluginState = searchHighlightPluginKey.getState(state);
          if (!pluginState || pluginState.matches.length === 0) return false;
          const nextIndex = (pluginState.currentIndex + 1) % pluginState.matches.length;
          if (dispatch) {
            dispatch(
              tr.setMeta(searchHighlightPluginKey, { type: 'setIndex', currentIndex: nextIndex }),
            );
          }
          return true;
        },
      goToPreviousMatch:
        () =>
        ({ state, tr, dispatch }: CommandProps) => {
          const pluginState = searchHighlightPluginKey.getState(state);
          if (!pluginState || pluginState.matches.length === 0) return false;
          const previousIndex =
            (pluginState.currentIndex - 1 + pluginState.matches.length) %
            pluginState.matches.length;
          if (dispatch) {
            dispatch(
              tr.setMeta(searchHighlightPluginKey, {
                type: 'setIndex',
                currentIndex: previousIndex,
              }),
            );
          }
          return true;
        },
    };
  },
});
