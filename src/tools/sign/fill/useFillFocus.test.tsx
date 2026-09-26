import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFillFocus, type UseFillFocusOptions } from './useFillFocus.ts';
import { FILL_INPUT_ATTR, FILL_KEY_ATTR } from './fillTypes.ts';
import type { SignToolAction } from '../components/SignToolContext.tsx';

// No @testing-library/preact-hooks in this repo - see useCoarsePointer.test.tsx
// for the same tiny-harness pattern used for hook tests elsewhere.
function Harness({ options }: { options: UseFillFocusOptions }) {
  useFillFocus(options);
  return null;
}

function mount(initial: UseFillFocusOptions) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let options = initial;
  const renderNow = () => act(() => { render(<Harness options={options} />, host); });
  renderNow();
  return {
    setOptions: (next: Partial<UseFillFocusOptions>) => { options = { ...options, ...next }; renderNow(); },
    unmount: () => act(() => render(null, host)),
  };
}

/** A focusable input carrying the fill DOM contract, same as FieldSlot/TextNode render it. */
function fillInput(key: string): HTMLInputElement {
  const input = document.createElement('input');
  input.setAttribute(FILL_INPUT_ATTR, '');
  input.setAttribute(FILL_KEY_ATTR, key);
  document.body.appendChild(input);
  return input;
}

function actionTypes(dispatch: ReturnType<typeof vi.fn>): SignToolAction[] {
  return dispatch.mock.calls.map(([action]) => action as SignToolAction);
}

describe('useFillFocus', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('focusing a fill input selects and opens editing on its element', () => {
    const dispatch = vi.fn();
    const textOf = vi.fn().mockReturnValue('hi');
    mount({ enabled: true, dispatch, textOf });
    const el1 = fillInput('el:1');

    act(() => { el1.focus(); });

    expect(actionTypes(dispatch)).toEqual([
      { type: 'SET_ACTIVE_ELEMENT_ID', payload: '1' },
      { type: 'SET_EDITING_ELEMENT_ID', payload: '1' },
    ]);
  });

  it('hops between two text inputs with no editing flicker: no end-editing lands after the hop settles', () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const textOf = vi.fn().mockReturnValue('hi');
    mount({ enabled: true, dispatch, textOf });
    const el1 = fillInput('el:1');
    const el2 = fillInput('el:2');

    act(() => { el1.focus(); });
    dispatch.mockClear();

    // The browser fires el1's focusout and el2's focusin synchronously, in
    // that order, inside this one call.
    act(() => { el2.focus(); });

    expect(actionTypes(dispatch)).toEqual([
      { type: 'SET_EDITING_ELEMENT_ID', payload: null },
      { type: 'SET_ACTIVE_ELEMENT_ID', payload: null },
      { type: 'SET_ACTIVE_ELEMENT_ID', payload: '2' },
      { type: 'SET_EDITING_ELEMENT_ID', payload: '2' },
    ]);

    dispatch.mockClear();
    // el1's deferred focusout check now runs. It must see focus already on
    // el2 and do nothing - a second "editing ended" here would be the flicker.
    act(() => { vi.advanceTimersByTime(0); });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('focus leaving to the body ends editing after the deferred check', () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const textOf = vi.fn().mockReturnValue('hi');
    mount({ enabled: true, dispatch, textOf });
    const el1 = fillInput('el:1');

    act(() => { el1.focus(); });
    dispatch.mockClear();

    act(() => { el1.blur(); });
    // Nothing yet: iOS may report no relatedTarget, so the decision waits
    // for the deferred read of document.activeElement.
    expect(dispatch).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(0); });

    expect(actionTypes(dispatch)).toEqual([
      { type: 'SET_EDITING_ELEMENT_ID', payload: null },
      { type: 'SET_ACTIVE_ELEMENT_ID', payload: null },
    ]);
  });

  it('focus moving into non-fill chrome (a toolbar button) keeps the session open', () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const textOf = vi.fn().mockReturnValue('hi');
    mount({ enabled: true, dispatch, textOf });
    const el1 = fillInput('el:1');
    const bold = document.createElement('button');
    document.body.appendChild(bold);

    act(() => { el1.focus(); });
    dispatch.mockClear();
    act(() => { bold.focus(); });
    act(() => { vi.runAllTimers(); });

    expect(actionTypes(dispatch)).toEqual([]);

    act(() => { bold.blur(); });
    act(() => { vi.runAllTimers(); });
    expect(actionTypes(dispatch)).toEqual([
      { type: 'SET_EDITING_ELEMENT_ID', payload: null },
      { type: 'SET_ACTIVE_ELEMENT_ID', payload: null },
    ]);
  });

  it('disabled attaches no listeners and never dispatches', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const dispatch = vi.fn();
    const textOf = vi.fn();
    mount({ enabled: false, dispatch, textOf });

    expect(addSpy).not.toHaveBeenCalledWith('focusin', expect.anything(), true);
    expect(addSpy).not.toHaveBeenCalledWith('focusout', expect.anything(), true);

    const el1 = fillInput('el:1');
    act(() => { el1.focus(); });

    expect(dispatch).not.toHaveBeenCalled();
    addSpy.mockRestore();
  });

  it('removes its listeners when disabled after being enabled, and on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const dispatch = vi.fn();
    const textOf = vi.fn();
    const { setOptions, unmount } = mount({ enabled: true, dispatch, textOf });

    setOptions({ enabled: false });
    expect(removeSpy).toHaveBeenCalledWith('focusin', expect.anything(), true);
    expect(removeSpy).toHaveBeenCalledWith('focusout', expect.anything(), true);
    removeSpy.mockClear();

    setOptions({ enabled: true });
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('focusin', expect.anything(), true);
    expect(removeSpy).toHaveBeenCalledWith('focusout', expect.anything(), true);
    removeSpy.mockRestore();
  });
});
