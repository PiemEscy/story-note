import { create } from 'zustand';

export type ThemeMode = 'dark' | 'light' | 'system';

interface UIState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}

// Default mirrors settings.theme in schema.md; persisted wiring lands in Phase 11.
export const useUIStore = create<UIState>((set) => ({
  theme: 'system',
  setTheme: (theme) => set({ theme }),
}));
