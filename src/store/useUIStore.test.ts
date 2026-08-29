import { afterEach, describe, expect, it } from 'vitest';
import { useUIStore } from './useUIStore';

afterEach(() => {
  useUIStore.setState({ theme: 'system' });
});

describe('useUIStore', () => {
  it('defaults theme to system', () => {
    expect(useUIStore.getState().theme).toBe('system');
  });

  it('updates theme via setTheme', () => {
    useUIStore.getState().setTheme('dark');

    expect(useUIStore.getState().theme).toBe('dark');
  });

  it('runs in a DOM environment (jsdom)', () => {
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');
  });
});
