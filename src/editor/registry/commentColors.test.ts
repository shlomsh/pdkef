import { describe, expect, it } from 'vitest';
import { COMMENT_ANCHOR_COLOR } from './commentColors.ts';

describe('COMMENT_ANCHOR_COLOR', () => {
  // The on-screen twin is --color-comment-anchor in global.css; the editor package cannot read site CSS.
  it('is a six-digit hex the PDF writer can parse', () => {
    expect(COMMENT_ANCHOR_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
