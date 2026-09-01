import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from './useToastStore';

beforeEach(() => {
  vi.useFakeTimers();
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('pushToast', () => {
  it('adds a toast with the given message and variant', () => {
    useToastStore.getState().pushToast('Imported 3 notes', 'success');

    expect(useToastStore.getState().toasts).toEqual([
      { id: expect.any(Number), message: 'Imported 3 notes', variant: 'success' },
    ]);
  });

  it('defaults to the success variant when none is given', () => {
    useToastStore.getState().pushToast('Done');

    expect(useToastStore.getState().toasts[0].variant).toBe('success');
  });

  it('stacks multiple toasts with distinct ids', () => {
    useToastStore.getState().pushToast('First');
    useToastStore.getState().pushToast('Second');

    const ids = useToastStore.getState().toasts.map((toast) => toast.id);
    expect(useToastStore.getState().toasts).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('auto-dismisses a toast after its duration elapses', () => {
    useToastStore.getState().pushToast('Fading');
    expect(useToastStore.getState().toasts).toHaveLength(1);

    vi.advanceTimersByTime(4000);

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('auto-dismissing one toast does not remove a still-fresh one', () => {
    useToastStore.getState().pushToast('Older');
    vi.advanceTimersByTime(3000);
    useToastStore.getState().pushToast('Newer');
    vi.advanceTimersByTime(1000);

    const messages = useToastStore.getState().toasts.map((toast) => toast.message);
    expect(messages).toEqual(['Newer']);
  });
});

describe('dismissToast', () => {
  it('removes the toast with the matching id', () => {
    useToastStore.getState().pushToast('Keep me');
    useToastStore.getState().pushToast('Remove me');
    const [, second] = useToastStore.getState().toasts;

    useToastStore.getState().dismissToast(second.id);

    const messages = useToastStore.getState().toasts.map((toast) => toast.message);
    expect(messages).toEqual(['Keep me']);
  });

  it('does nothing for an id that is not present', () => {
    useToastStore.getState().pushToast('Only one');

    useToastStore.getState().dismissToast(999999);

    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
});
