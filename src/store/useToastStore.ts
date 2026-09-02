import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  variant: 'success' | 'error';
}

interface ToastState {
  toasts: Toast[];
  pushToast: (message: string, variant?: Toast['variant']) => void;
  dismissToast: (id: number) => void;
}

let nextToastId = 1;
const TOAST_DURATION_MS = 4000;

// A minimal, app-wide toast stack — distinct from the per-store `error`
// banner pattern (useNoteStore.error and friends, rendered in App.tsx),
// which is for failures that need a persistent, dismissible message. Toasts
// are for transient confirmations (e.g. "Imported 3 notes") that clear
// themselves after a few seconds.
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  pushToast: (message, variant = 'success') => {
    const id = nextToastId++;
    set((state) => ({ toasts: [...state.toasts, { id, message, variant }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
    }, TOAST_DURATION_MS);
  },

  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
}));
