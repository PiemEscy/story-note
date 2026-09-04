import { create } from 'zustand';
import { aiService } from '../services/aiService';
import { settingsService } from '../services/settingsService';

interface AiState {
  // Persisted (settings.ai_enabled) — separate from hasApiKey below, since
  // ADR-002 gates both surfaces on *both* conditions independently (see
  // electron/ipc/aiHandlers.ts's requireAiAvailable).
  enabled: boolean;
  // Whether a key is currently stored in OS credential storage — never the
  // key itself, which this store (and the renderer generally) never sees in
  // plain text once saved.
  hasApiKey: boolean;
  isLoaded: boolean;
  isSavingApiKey: boolean;
  apiKeyError: string | null;

  // Both surfaces should only actually be usable when both conditions hold
  // — mirrors the main process's own requireAiAvailable check, so the UI's
  // "is this usable" question and the IPC layer's "will this fire a network
  // call" question can never silently disagree.
  isAvailable: () => boolean;

  loadStatus: () => Promise<void>;
  setEnabled: (value: boolean) => void;
  saveApiKey: (apiKey: string) => Promise<boolean>;
  removeApiKey: () => Promise<boolean>;
  clearApiKeyError: () => void;
}

export const useAiStore = create<AiState>((set, get) => ({
  enabled: false,
  hasApiKey: false,
  isLoaded: false,
  isSavingApiKey: false,
  apiKeyError: null,

  isAvailable: () => get().enabled && get().hasApiKey,

  loadStatus: async () => {
    try {
      const status = await aiService.getStatus();
      set({ enabled: status.enabled, hasApiKey: status.hasApiKey, isLoaded: true });
    } catch (error) {
      // Matches useNoteStore's loadNoteCounts reasoning — a failed status
      // load shouldn't block the rest of the app; both AI entry points
      // simply stay in their "not available" state until it succeeds.
      console.error('[useAiStore] failed to load AI status', error);
      set({ isLoaded: true });
    }
  },

  setEnabled: (value) => {
    set({ enabled: value });
    settingsService.set('ai_enabled', String(value)).catch((error: unknown) => {
      console.error('[useAiStore] failed to persist ai_enabled setting', error);
    });
  },

  saveApiKey: async (apiKey) => {
    set({ isSavingApiKey: true, apiKeyError: null });
    try {
      await aiService.setApiKey(apiKey);
      set({ hasApiKey: true, isSavingApiKey: false });
      return true;
    } catch (error) {
      set({
        isSavingApiKey: false,
        apiKeyError: error instanceof Error ? error.message : 'Failed to save the API key',
      });
      return false;
    }
  },

  removeApiKey: async () => {
    set({ isSavingApiKey: true, apiKeyError: null });
    try {
      await aiService.clearApiKey();
      set({ hasApiKey: false, isSavingApiKey: false });
      return true;
    } catch (error) {
      set({
        isSavingApiKey: false,
        apiKeyError: error instanceof Error ? error.message : 'Failed to remove the API key',
      });
      return false;
    }
  },

  clearApiKeyError: () => set({ apiKeyError: null }),
}));
