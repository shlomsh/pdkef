import { describe, expect, it, vi } from 'vitest';
import { FILL_INPUT_ATTR, FILL_KEY_ATTR } from './fillTypes.ts';
import { focusFillInput, focusNextFillInput } from './fillDom.ts';

/**
 * Fake fill inputs, not jsdom: `fillInputs(root)` only reads `root.querySelectorAll`, `getAttribute`
 * and calls `focus`/`blur` on the result, so a plain object stands in for the element and `focus` is
 * spied on to see whether `preventScroll` was passed.
 */
function fakeInput(key: string) {
  return {
    getAttribute: (attr: string) => (attr === FILL_KEY_ATTR ? key : FILL_INPUT_ATTR),
    focus: vi.fn(),
    blur: vi.fn(),
  };
}

function fakeRoot(inputs: ReturnType<typeof fakeInput>[]) {
  return { querySelectorAll: () => inputs } as unknown as ParentNode;
}

describe('focusNextFillInput', () => {
  it('focuses the next input with no preventScroll, so the platform can scroll it into view', () => {
    const first = fakeInput('a');
    const second = fakeInput('b');
    focusNextFillInput('a', fakeRoot([first, second]));

    expect(second.focus).toHaveBeenCalledTimes(1);
    expect(second.focus.mock.calls[0]).toHaveLength(0);
    expect(first.focus).not.toHaveBeenCalled();
  });

  it('blurs the last input instead of focusing a next one', () => {
    const first = fakeInput('a');
    const last = fakeInput('b');
    focusNextFillInput('b', fakeRoot([first, last]));

    expect(last.blur).toHaveBeenCalledTimes(1);
    expect(first.focus).not.toHaveBeenCalled();
    expect(last.focus).not.toHaveBeenCalled();
  });
});

describe('focusFillInput', () => {
  it('still focuses the tapped input with preventScroll', () => {
    const target = fakeInput('a');
    const found = focusFillInput('a', fakeRoot([target]));

    expect(found).toBe(true);
    expect(target.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});
