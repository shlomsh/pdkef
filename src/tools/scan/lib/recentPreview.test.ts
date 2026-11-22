// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { recentPreview } from './recentPreview.ts';

describe('recentPreview', () => {
  it('is null where the browser cannot decode a blob into a bitmap', async () => {
    expect(await recentPreview(new Blob(['x'], { type: 'image/jpeg' }))).toBeNull();
  });
});
