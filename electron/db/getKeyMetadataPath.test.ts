import { describe, expect, it } from 'vitest';
import { getKeyMetadataPath } from './getKeyMetadataPath';

describe('getKeyMetadataPath', () => {
  it('joins the userData path with the metadata filename', () => {
    const result = getKeyMetadataPath('C:\\Users\\example\\AppData\\Roaming\\StoryNote');

    expect(result.endsWith('storynote.keymeta.json')).toBe(true);
    expect(result.startsWith('C:\\Users\\example\\AppData\\Roaming\\StoryNote')).toBe(true);
  });
});
