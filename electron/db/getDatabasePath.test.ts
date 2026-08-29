import { describe, expect, it } from 'vitest';
import { getDatabasePath } from './getDatabasePath';

describe('getDatabasePath', () => {
  it('joins the userData path with the database filename', () => {
    const result = getDatabasePath('C:\\Users\\example\\AppData\\Roaming\\StoryNote');

    expect(result.endsWith('storynote.db')).toBe(true);
    expect(result.startsWith('C:\\Users\\example\\AppData\\Roaming\\StoryNote')).toBe(true);
  });
});
