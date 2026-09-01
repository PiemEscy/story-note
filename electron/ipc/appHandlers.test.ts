import { describe, expect, it, vi } from 'vitest';
import { handleIsLocked, handleUnlock } from './appHandlers';
import type { AppUnlockDeps } from './appHandlers';

describe('handleIsLocked', () => {
  it('reflects the current lock state', () => {
    expect(handleIsLocked({ isLocked: () => true, unlock: vi.fn() })).toEqual({
      ok: true,
      data: true,
    });
    expect(handleIsLocked({ isLocked: () => false, unlock: vi.fn() })).toEqual({
      ok: true,
      data: false,
    });
  });
});

describe('handleUnlock', () => {
  it('calls deps.unlock with the submitted password and reports success', () => {
    const unlock = vi.fn();
    const deps: AppUnlockDeps = { isLocked: () => true, unlock };

    const result = handleUnlock(deps, 'the-password');

    expect(unlock).toHaveBeenCalledWith('the-password');
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it('reports failure (not a thrown exception) when deps.unlock throws', () => {
    const deps: AppUnlockDeps = {
      isLocked: () => true,
      unlock: () => {
        throw new Error('Incorrect password');
      },
    };

    const result = handleUnlock(deps, 'wrong-password');

    expect(result).toEqual({ ok: false, message: 'Incorrect password' });
  });

  it('rejects a non-string password instead of throwing an unhandled exception', () => {
    const deps: AppUnlockDeps = { isLocked: () => true, unlock: vi.fn() };

    const result = handleUnlock(deps, { not: 'a string' });

    expect(result.ok).toBe(false);
  });
});
