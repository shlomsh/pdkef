import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FontSheet, { computeSheetRevealScroll, FILL_KEEP_SESSION_ATTR } from './FontSheet.tsx';
import { englishSignMessages } from '../i18n/toolMessages';

describe('computeSheetRevealScroll', () => {
  it('is zero when the element already clears the sheet by the margin', () => {
    expect(computeSheetRevealScroll(100, 200)).toBe(0);
  });

  it('scrolls just enough to clear the sheet top by the margin', () => {
    expect(computeSheetRevealScroll(500, 480, 16)).toBe(36);
  });

  it('never returns a negative delta', () => {
    expect(computeSheetRevealScroll(0, 1000)).toBe(0);
  });
});

describe('FontSheet', () => {
  let container: HTMLDivElement | null;

  beforeEach(() => {
    // jsdom has no real <dialog> behaviour (SignatureDialog.test.tsx stubs
    // the same two methods for the same reason).
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true; });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.open = false; });
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container as any));
      container.remove();
      container = null;
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function openSheet(extra = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(
        <FontSheet
          trigger={<button type="button">Aa</button>}
          value="Arimo"
          text="Hello"
          onChange={() => {}}
          t={englishSignMessages}
          {...extra}
        />,
        container as any,
      );
    });
    act(() => {
      container!.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    return document.body.querySelector('[data-font-picker-sheet]') as HTMLDialogElement;
  }

  it('opens as a dialog carrying the fill-keep-session attribute', () => {
    const sheet = openSheet();
    expect(sheet).not.toBeNull();
    expect(sheet.getAttribute(FILL_KEEP_SESSION_ATTR)).toBe('true');
    expect(sheet.tabIndex).toBe(-1);
  });

  it('does not autofocus the search field - the person taps it', () => {
    const sheet = openSheet();
    const search = sheet.querySelector('input[type="search"]');
    expect(document.activeElement).not.toBe(search);
  });

  it('previews a tapped row immediately, and marks it selected, without committing', () => {
    const onPreview = vi.fn();
    const onChange = vi.fn();
    const sheet = openSheet({ onPreview, onChange });
    const row = sheet.querySelector('[data-font-name="Caveat"]') as HTMLButtonElement;

    act(() => row.click());

    expect(onPreview).toHaveBeenCalledWith('Caveat');
    expect(onChange).not.toHaveBeenCalled();
    expect(row.getAttribute('aria-selected')).toBe('true');
    expect(document.body.querySelector('[data-font-picker-sheet]')).not.toBeNull();
  });

  it('Done commits the previewed family and closes the sheet', () => {
    const onChange = vi.fn();
    const onPreviewEnd = vi.fn();
    const sheet = openSheet({ onChange, onPreviewEnd });
    act(() => (sheet.querySelector('[data-font-name="Caveat"]') as HTMLButtonElement).click());
    const done = [...sheet.querySelectorAll('button')].find((b) => b.textContent === 'Done')!;

    act(() => done.click());

    expect(onChange).toHaveBeenCalledWith('Caveat');
    expect(onPreviewEnd).toHaveBeenCalledOnce();
    expect(document.body.querySelector('[data-font-picker-sheet]')).toBeNull();
  });

  it('Cancel reverts (calls onPreviewEnd, never onChange) and closes the sheet', () => {
    const onChange = vi.fn();
    const onPreviewEnd = vi.fn();
    const sheet = openSheet({ onChange, onPreviewEnd });
    act(() => (sheet.querySelector('[data-font-name="Caveat"]') as HTMLButtonElement).click());
    const cancel = [...sheet.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!;

    act(() => cancel.click());

    expect(onChange).not.toHaveBeenCalled();
    expect(onPreviewEnd).toHaveBeenCalledOnce();
    expect(document.body.querySelector('[data-font-picker-sheet]')).toBeNull();
  });

  it('a click landing on the dialog itself (the backdrop) commits, same as Done', () => {
    const onChange = vi.fn();
    const sheet = openSheet({ onChange });
    act(() => (sheet.querySelector('[data-font-name="Caveat"]') as HTMLButtonElement).click());

    act(() => { sheet.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(onChange).toHaveBeenCalledWith('Caveat');
    expect(document.body.querySelector('[data-font-picker-sheet]')).toBeNull();
  });

  it('a click on a row or header button never reaches the backdrop-commit path', () => {
    const onChange = vi.fn();
    const sheet = openSheet({ onChange });
    const row = sheet.querySelector('[data-font-name="Caveat"]') as HTMLButtonElement;

    act(() => row.click());

    expect(onChange).not.toHaveBeenCalled();
  });

  it('Escape (the dialog cancel event) reverts, never commits', () => {
    const onChange = vi.fn();
    const onPreviewEnd = vi.fn();
    const sheet = openSheet({ onChange, onPreviewEnd });
    act(() => (sheet.querySelector('[data-font-name="Caveat"]') as HTMLButtonElement).click());

    act(() => { sheet.dispatchEvent(new Event('cancel', { cancelable: true })); });

    expect(onChange).not.toHaveBeenCalled();
    expect(onPreviewEnd).toHaveBeenCalledOnce();
    expect(document.body.querySelector('[data-font-picker-sheet]')).toBeNull();
  });

  it('restores focus to the element that had it before opening', () => {
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.focus();
    expect(document.activeElement).toBe(field);

    const sheet = openSheet();
    const cancel = [...sheet.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!;

    act(() => cancel.click());

    expect(document.activeElement).toBe(field);
    field.remove();
  });
});
