import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FontSupportNotice, { getFontNoticePosition } from './FontSupportNotice.tsx';
import type { FontSupportNoticeProps } from './FontSupportNotice.tsx';
import styles from './FontSupportNotice.module.css';

describe('getFontNoticePosition', () => {
  it.each([
    ['ltr', 'bottom-end', 'right', 12],
    ['rtl', 'bottom-start', 'left', -12],
  ])('places an inactive %s marker at the physical bottom end', (direction, placement, side, crossAxis) => {
    expect(getFontNoticePosition(direction, false)).toEqual({
      placement,
      markerSide: side,
      offset: { mainAxis: -10, crossAxis },
    });
  });

  it.each([
    ['ltr', 'bottom-start'],
    ['rtl', 'bottom-end'],
  ])('keeps the active %s explanation aligned with the text origin', (direction, placement) => {
    expect(getFontNoticePosition(direction, true)).toEqual({
      placement,
      markerSide: null,
      offset: 8,
    });
  });

  it('treats an unknown direction as LTR instead of moving the marker unpredictably', () => {
    expect(getFontNoticePosition('', false).markerSide).toBe('right');
  });
});

describe('FontSupportNotice component', () => {
  let host: HTMLDivElement | null = null;
  let referenceElement: HTMLDivElement | null = null;

  afterEach(() => {
    if (host) act(() => render(null, host!));
    host?.remove();
    referenceElement?.remove();
    host = null;
    referenceElement = null;
  });

  function show(overrides: Partial<FontSupportNoticeProps> = {}) {
    if (!host) {
      host = document.createElement('div');
      referenceElement = document.createElement('div');
      document.body.append(referenceElement, host);
    }
    const props = {
      reference: { current: referenceElement },
      message: 'No single available font includes all this text.',
      needsAttention: true,
      isActive: false,
      onEdit: vi.fn(),
      direction: 'ltr',
      ...overrides,
    };
    act(() => render(<FontSupportNotice {...props} />, host!));
    return { props, notice: host.querySelector('[data-editor-font-notice]') as HTMLElement };
  }

  it('renders an icon-only, keyboard-accessible LTR marker with no stale visible label', () => {
    const { notice } = show();
    const button = notice.querySelector('button')!;
    expect(notice.classList.contains(styles.marker)).toBe(true);
    expect(notice.dataset.editorFontPlacement).toBe('bottom-end');
    expect(notice.dataset.editorFontMarkerSide).toBe('right');
    expect(button.textContent).toBe('');
    expect(button.getAttribute('aria-label')).toBe('Text needs attention. Select for font suggestions.');
    expect(button.getAttribute('title')).toBe('Text needs attention');
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('mirrors the inactive marker to the physical left for RTL', () => {
    const { notice } = show({ direction: 'rtl' });
    expect(notice.dataset.editorFontPlacement).toBe('bottom-start');
    expect(notice.dataset.editorFontMarkerSide).toBe('left');
  });

  it('opens editing from the marker and keeps pointer gestures out of the element behind it', () => {
    const onEdit = vi.fn();
    const backgroundMouseDown = vi.fn();
    const backgroundTouchStart = vi.fn();
    host = document.createElement('div');
    referenceElement = document.createElement('div');
    document.body.append(referenceElement, host);
    host.addEventListener('mousedown', backgroundMouseDown);
    host.addEventListener('touchstart', backgroundTouchStart);
    const { notice } = show({ onEdit });
    const button = notice.querySelector('button')!;

    act(() => {
      button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      button.dispatchEvent(new Event('touchstart', { bubbles: true }));
      button.click();
    });

    expect(backgroundMouseDown).not.toHaveBeenCalled();
    expect(backgroundTouchStart).not.toHaveBeenCalled();
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('replaces the marker with the detailed message while active', () => {
    const { notice } = show({ isActive: true, direction: 'rtl' });
    expect(notice.classList.contains(styles.detail)).toBe(true);
    expect(notice.dataset.editorFontPlacement).toBe('bottom-end');
    expect(notice.hasAttribute('data-editor-font-marker-side')).toBe(false);
    expect(notice.querySelector('button')).toBeNull();
    expect(notice.textContent).toBe('No single available font includes all this text.');
  });

  it('updates placement and content when direction and selection change', () => {
    let result = show({ direction: 'ltr', isActive: false });
    expect(result.notice.dataset.editorFontMarkerSide).toBe('right');

    result = show({ direction: 'rtl', isActive: false });
    expect(result.notice.dataset.editorFontMarkerSide).toBe('left');

    result = show({ direction: 'rtl', isActive: true, message: 'Detailed RTL guidance.' });
    expect(result.notice.hasAttribute('data-editor-font-marker-side')).toBe(false);
    expect(result.notice.textContent).toBe('Detailed RTL guidance.');
  });
});
