import { create } from 'zustand';
import { aiService } from '../services/aiService';
import type { AiChatMessage } from '../services/aiService';
import { useNoteStore } from './useNoteStore';
import type { PublicNoteRow } from '../services/notesService';
import { textToTipTapDocJson } from '../utils/aiContent';

export interface AiChatDisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// AI-drafted title: first non-empty line, trimmed to a reasonable length —
// no title field exists in the assistant's plain-text reply, so this is a
// best-effort derivation, same spirit as a human typing a quick title after
// pasting in content.
const MAX_TITLE_LENGTH = 80;
function deriveTitle(content: string): string {
  const firstLine = content.split('\n').find((line) => line.trim().length > 0) ?? '';
  const cleaned = firstLine.replace(/^#+\s*/, '').trim();
  if (cleaned.length === 0) return 'Untitled';
  return cleaned.length > MAX_TITLE_LENGTH ? `${cleaned.slice(0, MAX_TITLE_LENGTH - 1)}…` : cleaned;
}

interface AiChatState {
  messages: AiChatDisplayMessage[];
  isSending: boolean;
  error: string | null;
  // Notes created via saveAsNote this session — no schema/settings change
  // for this (ADR-002's Consequences only calls out settings.ai_enabled),
  // so this is an in-memory marker, not a persisted column: EditorPanel
  // shows the AI badge next to the title for a note in this set, for as
  // long as this session lasts. Deliberately not cleared by reset() below —
  // reset() clears the *chat transcript* per ADR-002; a note the user chose
  // to keep is a real, ordinary note from that point on, independent of the
  // chat session that created it.
  aiOriginatedNoteIds: Set<number>;

  sendMessage: (content: string) => Promise<void>;
  regenerate: (assistantMessageId: string) => Promise<void>;
  saveAsNote: (assistantMessageId: string) => Promise<PublicNoteRow | null>;
  clearError: () => void;
  // Session-only, per ADR-002 — closing the modal clears it; there is no
  // persistence action anywhere in this store by design (never SQLite,
  // never disk).
  reset: () => void;
}

function toApiMessages(messages: AiChatDisplayMessage[]): AiChatMessage[] {
  return messages.map(({ role, content }) => ({ role, content }));
}

export const useAiChatStore = create<AiChatState>((set, get) => ({
  messages: [],
  isSending: false,
  error: null,
  aiOriginatedNoteIds: new Set(),

  sendMessage: async (content) => {
    const trimmed = content.trim();
    if (trimmed.length === 0 || get().isSending) return;

    const userMessage: AiChatDisplayMessage = { id: generateId(), role: 'user', content: trimmed };
    set((state) => ({ messages: [...state.messages, userMessage], isSending: true, error: null }));

    try {
      const { reply } = await aiService.chat(toApiMessages(get().messages));
      const assistantMessage: AiChatDisplayMessage = {
        id: generateId(),
        role: 'assistant',
        content: reply,
      };
      set((state) => ({ messages: [...state.messages, assistantMessage], isSending: false }));
    } catch (error) {
      set({
        isSending: false,
        error: error instanceof Error ? error.message : 'Failed to get a response',
      });
    }
  },

  regenerate: async (assistantMessageId) => {
    const { messages } = get();
    const index = messages.findIndex((message) => message.id === assistantMessageId);
    if (index === -1 || messages[index].role !== 'assistant' || get().isSending) return;

    // Re-sends everything up to (but not including) the message being
    // regenerated, then replaces just that message's content in place —
    // keeps the conversation's shape stable rather than appending a
    // duplicate turn.
    const history = messages.slice(0, index);
    set({ isSending: true, error: null });
    try {
      const { reply } = await aiService.chat(toApiMessages(history));
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === assistantMessageId ? { ...message, content: reply } : message,
        ),
        isSending: false,
      }));
    } catch (error) {
      set({
        isSending: false,
        error: error instanceof Error ? error.message : 'Failed to get a response',
      });
    }
  },

  saveAsNote: async (assistantMessageId) => {
    const message = get().messages.find((entry) => entry.id === assistantMessageId);
    if (!message || message.role !== 'assistant') return null;
    const created = await useNoteStore.getState().createNote({
      title: deriveTitle(message.content),
      content: textToTipTapDocJson(message.content),
      contentPlain: message.content,
    });
    if (created) {
      set((state) => ({
        aiOriginatedNoteIds: new Set(state.aiOriginatedNoteIds).add(created.id),
      }));
    }
    return created;
  },

  clearError: () => set({ error: null }),

  reset: () => set({ messages: [], isSending: false, error: null }),
}));
