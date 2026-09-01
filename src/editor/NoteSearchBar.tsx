import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { searchHighlightPluginKey } from './searchHighlight';
import { SearchIcon, CloseIcon, ChevronUpIcon, ChevronDownIcon } from '../components/icons';

interface NoteSearchBarProps {
  editor: Editor;
  query: string;
  onQueryChange: (query: string) => void;
  onClose: () => void;
}

// Ctrl+F's search bar — a small floating panel over the top-right of the
// note content, matching the common browser/editor "find in page" pattern.
// Owns none of the actual match-finding logic itself (that lives in
// searchHighlight.ts's ProseMirror plugin, shared with the global-search
// auto-highlight EditorPanel.tsx applies when a note is opened from a
// search result) — just the query input, the live match count, and
// next/previous navigation.
function NoteSearchBar({
  editor,
  query,
  onQueryChange,
  onClose,
}: NoteSearchBarProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [matchCount, setMatchCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(-1);

  // select() as well as focus() — when Ctrl+F pre-fills the query from a
  // text selection in the note (EditorPanel.tsx), this lets the user
  // immediately type to replace it, the same as a browser's own Ctrl+F.
  // A harmless no-op on an empty input.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // The plugin's own state only lives inside editor.state — TipTap doesn't
  // re-render this component just because a transaction changed it, so
  // this mirrors match count/current index into local state on every
  // transaction (query changes, doc edits, next/previous navigation), and
  // scrolls the new current match into view whenever it actually changes.
  useEffect(() => {
    let previousIndex = -1;
    const sync = (): void => {
      const state = searchHighlightPluginKey.getState(editor.state);
      const nextIndex = state?.currentIndex ?? -1;
      setMatchCount(state?.matches.length ?? 0);
      setCurrentIndex(nextIndex);
      if (nextIndex !== -1 && nextIndex !== previousIndex) {
        editor.view.dom
          .querySelector('.search-match-current')
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      previousIndex = nextIndex;
    };
    sync();
    editor.on('transaction', sync);
    return () => {
      editor.off('transaction', sync);
    };
  }, [editor]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) editor.commands.goToPreviousMatch();
      else editor.commands.goToNextMatch();
    }
  };

  return (
    <div className="absolute top-2 right-2 z-[50] flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-surface-raised)] p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.16)]">
      <SearchIcon className="ml-1 h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in note…"
        className="w-[160px] border-0 bg-transparent text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
      />
      <span className="w-10 shrink-0 text-center font-mono text-[11px] text-[var(--text-tertiary)]">
        {query ? `${matchCount > 0 ? currentIndex + 1 : 0}/${matchCount}` : ''}
      </span>
      <button
        type="button"
        title="Previous match (Shift+Enter)"
        onClick={() => editor.commands.goToPreviousMatch()}
        disabled={matchCount === 0}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
      >
        <ChevronUpIcon className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Next match (Enter)"
        onClick={() => editor.commands.goToNextMatch()}
        disabled={matchCount === 0}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
      >
        <ChevronDownIcon className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Close (Esc)"
        onClick={onClose}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default NoteSearchBar;
