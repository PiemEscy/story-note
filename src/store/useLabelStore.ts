import { create } from 'zustand';
import { labelsService } from '../services/labelsService';
import type { LabelRow } from '../services/labelsService';
import { useUIStore } from './useUIStore';

interface LabelState {
  labels: LabelRow[];
  isLoading: boolean;
  error: string | null;

  loadLabels: () => Promise<void>;
  createLabel: (input: { name: string; color: string | null }) => Promise<boolean>;
  updateLabel: (id: number, input: { name?: string; color?: string | null }) => Promise<boolean>;
  deleteLabel: (id: number) => Promise<boolean>;
  clearError: () => void;
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export const useLabelStore = create<LabelState>((set, get) => ({
  labels: [],
  isLoading: false,
  error: null,

  loadLabels: async () => {
    set({ isLoading: true, error: null });
    try {
      const labels = await labelsService.list();
      set({ labels, isLoading: false });
    } catch (error) {
      set({ isLoading: false, error: messageFrom(error, 'Failed to load labels') });
    }
  },

  createLabel: async (input) => {
    try {
      const label = await labelsService.create(input);
      set({ labels: [...get().labels, label].sort((a, b) => a.name.localeCompare(b.name)) });
      return true;
    } catch (error) {
      set({ error: messageFrom(error, 'Failed to create label') });
      return false;
    }
  },

  updateLabel: async (id, input) => {
    try {
      const updated = await labelsService.update({ id, ...input });
      set({
        labels: get()
          .labels.map((label) => (label.id === id ? updated : label))
          .sort((a, b) => a.name.localeCompare(b.name)),
      });
      return true;
    } catch (error) {
      set({ error: messageFrom(error, 'Failed to update label') });
      return false;
    }
  },

  deleteLabel: async (id) => {
    try {
      await labelsService.delete(id);
      set({ labels: get().labels.filter((label) => label.id !== id) });
      // A deleted label can't stay anyone's default — matches notes.label_id's
      // own ON DELETE SET NULL behavior (schema.md), just for the settings-
      // stored default rather than a DB foreign key.
      if (useUIStore.getState().defaultLabelId === id) {
        useUIStore.getState().setDefaultLabelId(null);
      }
      return true;
    } catch (error) {
      set({ error: messageFrom(error, 'Failed to delete label') });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));

// A label's color with the schema's documented fallback applied (schema.md:
// "NULL uses the application default color") — the single place this rule
// lives, rather than each `?? '--label-default'` call site repeating it.
export function resolveLabelColor(color: string | null | undefined): string {
  return color ?? 'var(--label-default)';
}
