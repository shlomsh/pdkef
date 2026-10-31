// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { swallowNextClick } from './swallowNextClick.ts';

describe('swallowNextClick', () => {
  it('swallows exactly one click in the capture phase', () => {
    const seen = vi.fn();
    document.body.addEventListener('click', seen);
    swallowNextClick();
    document.body.click();
    document.body.click();
    expect(seen).toHaveBeenCalledTimes(1);
    document.body.removeEventListener('click', seen);
  });

  it('a press that never clicks does not eat a later click', async () => {
    const seen = vi.fn();
    document.body.addEventListener('click', seen);
    swallowNextClick();
    window.dispatchEvent(new MouseEvent('mouseup'));
    await new Promise((r) => setTimeout(r, 5));
    document.body.click();
    expect(seen).toHaveBeenCalledTimes(1);
    document.body.removeEventListener('click', seen);
  });
});
