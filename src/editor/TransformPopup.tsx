import { useState } from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/react';
import { aiService } from '../services/aiService';
import type { TransformAction } from '../services/aiService';
import { useAiStore } from '../store/useAiStore';
import AiBadge from '../components/AiBadge';
import { FormatIcon, PolishIcon, SummarizeIcon } from '../components/icons';
import { textToParagraphNodes } from '../utils/aiContent';

interface TransformPopupProps {
  editor: Editor;
}

type SelectionRange = { from: number; to: number };

type PopupState =
  | { phase: 'buttons' }
  | { phase: 'format-input'; instructions: string }
  | { phase: 'loading'; action: TransformAction }
  | {
      phase: 'result';
      action: TransformAction;
      result: string;
      range: SelectionRange;
      // The exact text the range covered when the request was sent —
      // Replace/Insert below re-check this against the *current* document
      // before applying (see isRangeStillValid), since the AI call is a
      // network round trip during which the user could keep editing
      // elsewhere in the note, shifting what that range now points at.
      originalText: string;
    }
  | { phase: 'error'; message: string };

const ACTION_LABELS: Record<TransformAction, string> = {
  summarize: 'Summarize',
  polish: 'Polish',
  format: 'Format',
};

// True only if `range` still points at exactly the text it pointed at when
// the transform was requested — protects against the user editing earlier
// in the document while the AI call was in flight, which would otherwise
// silently shift what Replace/Insert below lands on.
function isRangeStillValid(editor: Editor, range: SelectionRange, originalText: string): boolean {
  if (range.to > editor.state.doc.content.size) return false;
  return editor.state.doc.textBetween(range.from, range.to, '\n') === originalText;
}

// TipTap selection/bubble-menu integration for ADR-002's Surface 2. Only
// ever mounted from NoteEditor.tsx alongside a real, unlocked note's editor
// — a locked note never reaches this component at all (NoteEditorForm
// renders LockedNotePanel instead of NoteEditor while locked), which is the
// actual mechanism behind "the transform popup is unreachable on a locked
// note" (ADR-002).
function TransformPopup({ editor }: TransformPopupProps): React.JSX.Element {
  const [state, setState] = useState<PopupState>({ phase: 'buttons' });
  // `enabled` alone (not isAvailable, which also requires a stored key)
  // gates whether the popup appears at all — see shouldShow below for why.
  const aiEnabled = useAiStore((store) => store.enabled);
  const isAvailable = useAiStore((store) => store.isAvailable());

  const resetToButtons = (): void => setState({ phase: 'buttons' });

  const runTransform = async (action: TransformAction, instructions?: string): Promise<void> => {
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, '\n');
    if (selectedText.trim().length === 0) return;

    setState({ phase: 'loading', action });
    try {
      const { result } = await aiService.transform({ selectedText, action, instructions });
      setState({
        phase: 'result',
        action,
        result,
        range: { from, to },
        originalText: selectedText,
      });
    } catch (error) {
      setState({
        phase: 'error',
        message: error instanceof Error ? error.message : 'Something went wrong. Try again.',
      });
    }
  };

  const handleReplace = (): void => {
    if (state.phase !== 'result') return;
    if (!isRangeStillValid(editor, state.range, state.originalText)) {
      setState({
        phase: 'error',
        message: 'The note changed while waiting for a response. Re-select the text and try again.',
      });
      return;
    }
    editor.chain().focus().insertContentAt(state.range, textToParagraphNodes(state.result)).run();
    resetToButtons();
  };

  const handleInsertBelow = (): void => {
    if (state.phase !== 'result') return;
    if (!isRangeStillValid(editor, state.range, state.originalText)) {
      setState({
        phase: 'error',
        message: 'The note changed while waiting for a response. Re-select the text and try again.',
      });
      return;
    }
    editor
      .chain()
      .focus()
      .insertContentAt(state.range.to, textToParagraphNodes(state.result))
      .run();
    resetToButtons();
  };

  return (
    <BubbleMenu
      editor={editor}
      // Requires AI to actually be turned on (settings.ai_enabled), not just
      // a real text selection — otherwise every user who has never touched
      // AI settings would get this popup on every plain-text selection
      // (copying, formatting, ...), which is exactly the kind of
      // AI-feature-affecting-the-core-editing-experience this is meant to
      // avoid. A user who *has* turned AI on but hasn't added a key yet
      // still sees it (isAvailable is false but aiEnabled is true), matching
      // ADR-002's "visibly present but disabled, with guidance" — they've
      // opted in, so this is the guidance, not an intrusion. Also never
      // while the popup's own action is still in flight or awaiting a
      // result — re-evaluating shouldShow off the *live* editor selection
      // while showing a loading/result/error state (none of which change
      // that selection) keeps the popup anchored in place rather than
      // disappearing mid-flow.
      shouldShow={({ state: editorState }) => aiEnabled && !editorState.selection.empty}
      options={{ placement: 'bottom-start', offset: 8 }}
      className="rounded-md border border-[var(--border)] bg-[var(--bg-surface-raised)] p-[5px] shadow-[0_12px_32px_rgba(15,23,42,0.18)]"
    >
      {state.phase === 'buttons' && (
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            disabled={!isAvailable}
            title={
              isAvailable ? undefined : 'Add an Anthropic API key in Settings to use AI features'
            }
            onClick={() => void runTransform('summarize')}
            className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <SummarizeIcon className="h-[13px] w-[13px] text-[#7C3AED]" />
            Summarize
          </button>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-[var(--border)]" />
          <button
            type="button"
            disabled={!isAvailable}
            title={
              isAvailable ? undefined : 'Add an Anthropic API key in Settings to use AI features'
            }
            onClick={() => void runTransform('polish')}
            className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <PolishIcon className="h-[13px] w-[13px] text-[#7C3AED]" />
            Polish
          </button>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-[var(--border)]" />
          <button
            type="button"
            disabled={!isAvailable}
            title={
              isAvailable ? undefined : 'Add an Anthropic API key in Settings to use AI features'
            }
            onClick={() => setState({ phase: 'format-input', instructions: '' })}
            className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <FormatIcon className="h-[13px] w-[13px] text-[#7C3AED]" />
            Format
          </button>
        </div>
      )}

      {state.phase === 'format-input' && (
        <div className="flex w-[220px] gap-1.5">
          <input
            type="text"
            autoFocus
            value={state.instructions}
            onChange={(event) =>
              setState({ phase: 'format-input', instructions: event.target.value })
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter' && state.instructions.trim().length > 0) {
                void runTransform('format', state.instructions.trim());
              }
              if (event.key === 'Escape') resetToButtons();
            }}
            placeholder='e.g. "as a bulleted list"'
            className="min-w-0 flex-1 rounded-sm border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            title="Apply format"
            disabled={state.instructions.trim().length === 0}
            onClick={() => void runTransform('format', state.instructions.trim())}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-[var(--accent)] text-white disabled:opacity-40"
          >
            <FormatIcon className="h-[13px] w-[13px]" />
          </button>
        </div>
      )}

      {state.phase === 'loading' && (
        <div className="flex items-center gap-2 px-2 py-1 text-xs text-[var(--text-tertiary)]">
          <span className="flex items-center gap-1">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="h-[5px] w-[5px] animate-bounce rounded-full bg-[var(--text-tertiary)]"
                style={{ animationDelay: `${index * 0.15}s` }}
              />
            ))}
          </span>
          Thinking…
        </div>
      )}

      {state.phase === 'result' && (
        <div className="w-[320px] p-1.5">
          <div className="mb-2 flex items-center gap-1.5">
            <AiBadge />
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              {ACTION_LABELS[state.action]} result
            </span>
          </div>
          <div className="mb-2.5 max-h-[160px] overflow-y-auto rounded-sm bg-[var(--bg-hover)] px-[11px] py-2.5 text-[13.5px] leading-[1.6] whitespace-pre-wrap text-[var(--text-primary)]">
            {state.result}
          </div>
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={resetToButtons}
              className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleInsertBelow}
              className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              Insert below
            </button>
            <button
              type="button"
              onClick={handleReplace}
              className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-[11.5px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
            >
              Replace
            </button>
          </div>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="w-[260px] p-1.5">
          <p className="m-0 mb-2 text-[12px] text-[#DC2626]" role="alert">
            {state.message}
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={resetToButtons}
              className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </BubbleMenu>
  );
}

export default TransformPopup;
