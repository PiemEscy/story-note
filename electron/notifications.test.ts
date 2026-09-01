import { describe, expect, it, vi } from 'vitest';
import { showNotification } from './notifications';

describe('showNotification', () => {
  it('creates and shows a notification when the platform supports it', () => {
    const show = vi.fn();
    const create = vi.fn().mockReturnValue({ show });

    showNotification(
      { title: 'StoryNote', body: 'Now running in the background' },
      { isSupported: () => true, create },
    );

    expect(create).toHaveBeenCalledWith({
      title: 'StoryNote',
      body: 'Now running in the background',
    });
    expect(show).toHaveBeenCalled();
  });

  it('does nothing when the platform has no notification backend', () => {
    const create = vi.fn();

    showNotification({ title: 'StoryNote', body: 'x' }, { isSupported: () => false, create });

    expect(create).not.toHaveBeenCalled();
  });
});
