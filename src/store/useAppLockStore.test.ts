import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppLockStore } from './useAppLockStore';

function installMockApi(overrides: Record<string, unknown> = {}): {
  isLocked: ReturnType<typeof vi.fn>;
  unlock: ReturnType<typeof vi.fn>;
} {
  const appApi = {
    isLocked: vi.fn().mockResolvedValue({ ok: true, data: false }),
    unlock: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    ...overrides,
  };
  // @ts-expect-error partial mock is sufficient — the store only touches `app`
  window.storyNoteAPI = { app: appApi };
  return appApi;
}

beforeEach(() => {
  useAppLockStore.setState({ isLocked: null, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('checkLockState', () => {
  it('reflects the main process lock state', async () => {
    installMockApi({ isLocked: vi.fn().mockResolvedValue({ ok: true, data: true }) });

    await useAppLockStore.getState().checkLockState();

    expect(useAppLockStore.getState().isLocked).toBe(true);
  });

  it('treats an unknown/failed check as locked, not as unlocked', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    installMockApi({ isLocked: vi.fn().mockRejectedValue(new Error('IPC failed')) });

    await useAppLockStore.getState().checkLockState();

    expect(useAppLockStore.getState().isLocked).toBe(true);
    expect(useAppLockStore.getState().error).toBe('IPC failed');
  });
});

describe('unlock', () => {
  it('sets isLocked to false and clears error on success', async () => {
    installMockApi();
    useAppLockStore.setState({ error: 'stale error' });

    const result = await useAppLockStore.getState().unlock('correct-password');

    expect(result).toBe(true);
    expect(useAppLockStore.getState().isLocked).toBe(false);
    expect(useAppLockStore.getState().error).toBeNull();
  });

  it('returns false and sets error state on an incorrect password, without touching isLocked', async () => {
    installMockApi({
      unlock: vi.fn().mockResolvedValue({ ok: false, message: 'Incorrect password' }),
    });
    useAppLockStore.setState({ isLocked: true });

    const result = await useAppLockStore.getState().unlock('wrong-password');

    expect(result).toBe(false);
    expect(useAppLockStore.getState().error).toBe('Incorrect password');
    expect(useAppLockStore.getState().isLocked).toBe(true);
  });
});

describe('clearError', () => {
  it('resets error to null', () => {
    useAppLockStore.setState({ error: 'something went wrong' });
    useAppLockStore.getState().clearError();
    expect(useAppLockStore.getState().error).toBeNull();
  });
});
