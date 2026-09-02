import { useEffect, useRef, useState } from 'react';
import { useAiChatStore } from '../store/useAiChatStore';
import type { AiChatDisplayMessage } from '../store/useAiChatStore';
import { AiSparkleIcon, CloseIcon, RegenerateIcon, SaveAsNoteIcon, SendIcon } from './icons';

interface AiChatModalProps {
  onClose: () => void;
}

const TEXTAREA_MAX_HEIGHT_PX = 100;

function MessageBubble({ message }: { message: AiChatDisplayMessage }): React.JSX.Element {
  const regenerate = useAiChatStore((state) => state.regenerate);
  const saveAsNote = useAiChatStore((state) => state.saveAsNote);
  const isSending = useAiChatStore((state) => state.isSending);
  const isUser = message.role === 'user';
  const [isSaved, setIsSaved] = useState(false);

  return (
    <div
      className={`flex max-w-[88%] gap-2.5 ${isUser ? 'flex-row-reverse self-end' : 'self-start'}`}
    >
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-[10px] font-bold ${
          isUser
            ? 'bg-[var(--bg-hover)] text-[var(--text-secondary)]'
            : 'bg-gradient-to-br from-[#7C3AED] to-[#2563EB] text-white'
        }`}
      >
        {isUser ? 'You' : <AiSparkleIcon className="h-3 w-3" />}
      </div>
      <div className="min-w-0">
        <div
          className={`rounded-md px-3 py-2.5 text-[13px] leading-[1.55] whitespace-pre-wrap ${
            isUser
              ? 'bg-[var(--accent)] text-white'
              : 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
          }`}
        >
          {message.content}
        </div>
        {!isUser && (
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              disabled={isSending}
              onClick={() => {
                void saveAsNote(message.id);
                setIsSaved(true);
              }}
              className="flex items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              <SaveAsNoteIcon className="h-[11px] w-[11px]" />
              {isSaved ? 'Saved as note' : 'Save as note'}
            </button>
            <button
              type="button"
              disabled={isSending}
              onClick={() => void regenerate(message.id)}
              className="flex items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              <RegenerateIcon className="h-[11px] w-[11px]" />
              Regenerate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator(): React.JSX.Element {
  return (
    <div className="flex max-w-[88%] gap-2.5 self-start">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-gradient-to-br from-[#7C3AED] to-[#2563EB] text-white">
        <AiSparkleIcon className="h-3 w-3" />
      </div>
      <div className="flex items-center gap-1 rounded-md bg-[var(--bg-hover)] px-3 py-2.5">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-[5px] w-[5px] animate-bounce rounded-full bg-[var(--text-tertiary)]"
            style={{ animationDelay: `${index * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function AiChatModal({ onClose }: AiChatModalProps): React.JSX.Element {
  const messages = useAiChatStore((state) => state.messages);
  const isSending = useAiChatStore((state) => state.isSending);
  const error = useAiChatStore((state) => state.error);
  const sendMessage = useAiChatStore((state) => state.sendMessage);
  const clearError = useAiChatStore((state) => state.clearError);
  const reset = useAiChatStore((state) => state.reset);

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, isSending]);

  const handleClose = (): void => {
    // Session-only chat history (ADR-002) — closing the modal clears it;
    // aiOriginatedNoteIds is deliberately untouched (see useAiChatStore.ts).
    reset();
    onClose();
  };

  const handleSend = (): void => {
    if (draft.trim().length === 0 || isSending) return;
    void sendMessage(draft);
    setDraft('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setDraft(event.target.value);
    const el = event.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT_PX)}px`;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[350] flex items-center justify-center bg-[var(--scrim)]"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-chat-modal-title"
        className="flex h-[640px] max-h-[86vh] w-[560px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface-raised)] shadow-[0_12px_32px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-3.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#7C3AED] to-[#2563EB] text-white">
            <AiSparkleIcon className="h-[15px] w-[15px]" />
          </div>
          <div className="min-w-0">
            <h3
              id="ai-chat-modal-title"
              className="m-0 text-sm font-semibold text-[var(--text-primary)]"
            >
              Ask AI
            </h3>
            <p className="m-0 text-[11px] text-[var(--text-tertiary)]">
              Create a note or ask anything — nothing here is saved unless you choose to.
            </p>
          </div>
          <span className="flex-1" />
          <button
            type="button"
            title="Close"
            onClick={handleClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div ref={scrollRef} className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-4">
          {messages.length === 0 && (
            <p className="m-auto max-w-[280px] text-center text-[12.5px] text-[var(--text-tertiary)]">
              Ask anything, or ask AI to draft a note for you — try &quot;Draft a note about…&quot;.
            </p>
          )}
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isSending && <TypingIndicator />}
        </div>

        {error && (
          <div className="mx-4 mb-2 flex items-center justify-between gap-2 rounded-md border border-[rgba(220,38,38,0.3)] bg-[rgba(220,38,38,0.06)] px-3 py-2 text-[12px] text-[#DC2626]">
            {error}
            <button type="button" onClick={clearError} className="shrink-0 font-semibold">
              Dismiss
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 border-t border-[var(--border)] px-3.5 py-3">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Message AI…"
            rows={1}
            autoFocus
            className="max-h-[100px] min-h-[36px] flex-1 resize-none rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-[11px] py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
          />
          <button
            type="button"
            title="Send"
            disabled={draft.trim().length === 0 || isSending}
            onClick={handleSend}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--accent)] text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            <SendIcon className="h-[15px] w-[15px]" />
          </button>
        </div>
        <div className="px-4 pb-2.5 text-center text-[10.5px] text-[var(--text-tertiary)]">
          Messages are sent to Anthropic&apos;s API. Not stored after this chat is closed.
        </div>
      </div>
    </div>
  );
}

export default AiChatModal;
