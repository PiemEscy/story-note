import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveLabelColor, useLabelStore } from './useLabelStore';
import type { LabelRow } from '../services/labelsService';

function label(id: number, overrides: Partial<LabelRow> = {}): LabelRow {
  return {
    id,
    name: `Label ${id}`,
    color: null,
    created_at: '2026-01-01 00:00:00',
    ...overrides,
  };
}

interface MockLabelsApi {
  create: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  assign: ReturnType<typeof vi.fn>;
}

function installMockApi(overrides: Record<string, unknown> = {}): MockLabelsApi {
  const labelsApi = {
    create: vi.fn(),
    list: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    update: vi.fn(),
    delete: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    assign: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    ...overrides,
  };
  // @ts-expect-error partial mock is sufficient — the store only touches `labels`
  window.storyNoteAPI = { labels: labelsApi };
  return labelsApi;
}

beforeEach(() => {
  useLabelStore.setState({ labels: [], isLoading: false, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadLabels', () => {
  it('populates labels from the service', async () => {
    installMockApi({ list: vi.fn().mockResolvedValue({ ok: true, data: [label(1)] }) });

    await useLabelStore.getState().loadLabels();

    expect(useLabelStore.getState().labels).toEqual([label(1)]);
    expect(useLabelStore.getState().isLoading).toBe(false);
  });

  it('sets error state (and does not throw) when the service call fails', async () => {
    installMockApi({ list: vi.fn().mockResolvedValue({ ok: false, message: 'db is locked' }) });

    await useLabelStore.getState().loadLabels();

    expect(useLabelStore.getState().error).toBe('db is locked');
  });
});

describe('createLabel', () => {
  it('adds the new label to state, sorted by name', async () => {
    installMockApi({
      create: vi.fn().mockResolvedValue({ ok: true, data: label(2, { name: 'Alpha' }) }),
    });
    useLabelStore.setState({ labels: [label(1, { name: 'Zeta' })] });

    const result = await useLabelStore.getState().createLabel({ name: 'Alpha', color: null });

    expect(result).toBe(true);
    expect(useLabelStore.getState().labels.map((l) => l.name)).toEqual(['Alpha', 'Zeta']);
  });

  it('returns false and sets error state on failure', async () => {
    installMockApi({ create: vi.fn().mockResolvedValue({ ok: false, message: 'name taken' }) });

    const result = await useLabelStore.getState().createLabel({ name: 'Work', color: null });

    expect(result).toBe(false);
    expect(useLabelStore.getState().error).toBe('name taken');
  });
});

describe('updateLabel', () => {
  it('replaces the label in state on success', async () => {
    const updated = label(1, { name: 'Renamed' });
    installMockApi({ update: vi.fn().mockResolvedValue({ ok: true, data: updated }) });
    useLabelStore.setState({ labels: [label(1)] });

    const result = await useLabelStore.getState().updateLabel(1, { name: 'Renamed' });

    expect(result).toBe(true);
    expect(useLabelStore.getState().labels).toEqual([updated]);
  });
});

describe('deleteLabel', () => {
  it('removes the label from state on success', async () => {
    installMockApi();
    useLabelStore.setState({ labels: [label(1), label(2)] });

    const result = await useLabelStore.getState().deleteLabel(1);

    expect(result).toBe(true);
    expect(useLabelStore.getState().labels.map((l) => l.id)).toEqual([2]);
  });
});

describe('clearError', () => {
  it('resets error to null', () => {
    useLabelStore.setState({ error: 'something went wrong' });
    useLabelStore.getState().clearError();
    expect(useLabelStore.getState().error).toBeNull();
  });
});

describe('resolveLabelColor', () => {
  it('returns the label default token when color is null or undefined', () => {
    expect(resolveLabelColor(null)).toBe('var(--label-default)');
    expect(resolveLabelColor(undefined)).toBe('var(--label-default)');
  });

  it('returns the given color unchanged otherwise', () => {
    expect(resolveLabelColor('#2563EB')).toBe('#2563EB');
  });
});
