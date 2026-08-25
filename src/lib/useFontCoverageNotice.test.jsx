/**
 * The while-typing coverage warning.
 *
 * Every case here is about the hook's *timing*, not about which characters a
 * font covers - that is textCoverage.test.js's job. The warning is debounced
 * and then awaits a font fetch, so there is a window in which the document can
 * change out from under an in-flight check, and the failures in that window
 * are the kind a user reports as "it says my empty page has Arabic in it".
 */
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

// A controllable stand-in for the font-loading check, so a test can hold a
// result open across a document change instead of racing a real fetch.
const pending = [];
vi.mock('./liveFontCoverage.js', () => ({
  unsupportedCharactersInDocument: vi.fn(() => new Promise((resolve) => { pending.push(resolve); })),
}));

const { default: useFontCoverageNotice } = await import('./useFontCoverageNotice.js');

// No @testing-library/preact-hooks in this repo - same tiny-harness pattern as
// useCurrentPage.test.jsx.
function Harness({ apiRef, elements }) {
  apiRef.current = { message: useFontCoverageNotice(elements) };
  return null;
}

const arabicElement = { id: 'a', type: 'text', pageIndex: 0, fontFamily: 'Arimo', text: 'مرحبا' };

describe('useFontCoverageNotice', () => {
  let host;
  let apiRef;

  beforeEach(() => {
    vi.useFakeTimers();
    pending.length = 0;
    host = document.createElement('div');
    apiRef = { current: null };
  });

  afterEach(() => {
    render(null, host);
    vi.useRealTimers();
  });

  function show(elements) {
    act(() => { render(<Harness apiRef={apiRef} elements={elements} />, host); });
  }

  /**
   * The bug this guards: clearTimeout cancels a check that has not fired yet,
   * but one already past its timer and awaiting the font fetch cannot be
   * cancelled. If emptying the document does not also invalidate that in-flight
   * check, its result lands afterwards and the warning reappears on a document
   * with no text at all - and stays, because nothing recomputes until the
   * signature changes again.
   */
  it('does not resurrect a warning after the text that caused it is deleted', async () => {
    show([arabicElement]);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(pending).toHaveLength(1);

    // Delete everything while the check is still in flight.
    show([]);
    expect(apiRef.current.message).toBe('');

    // The stale check now resolves with characters that are no longer present.
    await act(async () => {
      pending[0]({ characters: ['م'], pageNumbers: [1] });
      await Promise.resolve();
    });

    expect(apiRef.current.message).toBe('');
  });

  it('does not warn about a document that was replaced mid-check', async () => {
    show([arabicElement]);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    // Swap the Arabic for text every font can draw, then let the stale result land.
    show([{ ...arabicElement, text: 'Hello' }]);
    await act(async () => {
      pending[0]({ characters: ['م'], pageNumbers: [1] });
      await Promise.resolve();
    });

    expect(apiRef.current.message).toBe('');
  });

  it('still reports a warning for text that is genuinely there', async () => {
    show([arabicElement]);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    await act(async () => {
      pending[0]({ characters: ['م'], pageNumbers: [1] });
      await Promise.resolve();
    });

    expect(apiRef.current.message).toContain('م');
  });

  /**
   * The signature decides when the check re-runs, so anything the coverage
   * policy reads must be in it. `findUnrepresentableCharacters` judges a comb
   * by `width` (isComb) and `combCells` (combCellCount), and a comb only draws
   * the characters that fit its cells. Dropping `width` un-combs the element,
   * so characters that were never rendered suddenly are - and if that does not
   * re-run the check, the warning and signPdf's refusal disagree, which is the
   * one thing the shared policy exists to prevent.
   */
  it('re-checks when comb fields change, not just when the text does', async () => {
    const comb = { id: 'c', type: 'text', pageIndex: 0, fontFamily: 'Arimo', text: 'abمرحبا', width: 40, combCells: 2 };
    show([comb]);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    const callsAfterFirst = pending.length;

    // Changing the font size on a comb clears its width by design (see
    // ElementToolbar's setFontSize), which stops it being a comb at all.
    show([{ ...comb, width: 0 }]);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    expect(pending.length).toBeGreaterThan(callsAfterFirst);
  });

  it('re-checks when the cell count changes', async () => {
    const comb = { id: 'c', type: 'text', pageIndex: 0, fontFamily: 'Arimo', text: 'abمرحبا', width: 40, combCells: 2 };
    show([comb]);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    const callsAfterFirst = pending.length;

    show([{ ...comb, combCells: 12 }]);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    expect(pending.length).toBeGreaterThan(callsAfterFirst);
  });
});
