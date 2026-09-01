import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { restoreWindow } from './tray';

describe('restoreWindow', () => {
  it('shows and focuses the window', () => {
    const window = { show: vi.fn(), focus: vi.fn() };

    restoreWindow({ getWindow: () => window as unknown as BrowserWindow });

    expect(window.show).toHaveBeenCalled();
    expect(window.focus).toHaveBeenCalled();
  });

  it('does nothing (no throw) if no window exists', () => {
    expect(() => restoreWindow({ getWindow: () => null })).not.toThrow();
  });
});
