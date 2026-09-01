import { create } from 'zustand';
import { appService } from '../services/appService';

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

interface AppLockState {
  // null = not yet checked (App.tsx/main.tsx render nothing meaningful
  // until this resolves, to avoid a flash of the wrong screen).
  isLocked: boolean | null;
  error: string | null;
  checkLockState: () => Promise<void>;
  unlock: (password: string) => Promise<boolean>;
  clearError: () => void;
}

// ADR-001's password mode — gates whether the real app or an unlock screen
// renders. Deliberately its own store, not folded into useUIStore: this is
// the one piece of state that exists *before* the rest of the app (and its
// other stores' IPC calls, all of which need the database this store is
// gating) can safely mount at all.
export const useAppLockStore = create<AppLockState>((set) => ({
  isLocked: null,
  error: null,

  checkLockState: async () => {
    try {
      const isLocked = await appService.isLocked();
      set({ isLocked });
    } catch (error) {
      // No sensible fallback between "show the app" and "show the unlock
      // screen" if this itself fails — surfacing it as the unlock screen's
      // own error state (isLocked: true) is the safer of the two: it can't
      // accidentally expose note content the database might be gating.
      set({ isLocked: true, error: messageFrom(error, 'Failed to check lock state') });
    }
  },

  unlock: async (password) => {
    try {
      await appService.unlock(password);
      set({ isLocked: false, error: null });
      return true;
    } catch (error) {
      set({ error: messageFrom(error, 'Failed to unlock') });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));
