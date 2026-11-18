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
    vi.useFakeTimers();
    const seen = vi.fn();
    try {
      document.body.addEventListener('click', seen);
      swallowNextClick();
      window.dispatchEvent(new MouseEvent('mouseup'));
      await vi.advanceTimersByTimeAsync(1); // the product's setTimeout(cleanup, 0) after mouseup
      document.body.click();
      expect(seen).toHaveBeenCalledTimes(1);
    } finally {
      document.body.removeEventListener('click', seen);
      vi.useRealTimers();
    }
  });
});
