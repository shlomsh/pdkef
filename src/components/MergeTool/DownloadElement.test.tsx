// @ts-nocheck - test-only, mirrors PdfMergeTool.test.tsx's untyped style
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DownloadElement from './DownloadElement.tsx';
import styles from './DownloadElement.module.css';
import { englishMergeMessages } from '../../i18n/toolMessages';

describe('DownloadElement', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
  });

  function mount(props) {
    container = document.createElement('div');
    document.body.appendChild(container);
    let current = { messages: englishMergeMessages, ...props };
    act(() => render(<DownloadElement {...current} />, container));
    const rerender = (next) => {
      current = { ...current, ...next };
      act(() => render(<DownloadElement {...current} />, container));
    };
    return { rerender };
  }

  const box = () => container.querySelector(`.${styles.box}`);

  it('one-file: a sentence, plain surface (not a button), and a real "Choose files" button', () => {
    const onChooseFiles = vi.fn();
    mount({ state: 'one-file', onChooseFiles, chooseFilesLabel: 'Choose files' });
    const el = box();
    expect(el.textContent).toContain('Add one more PDF to merge');
    expect(el.hasAttribute('disabled')).toBe(false);
    expect(el.getAttribute('href')).toBeNull();
    // The box itself is never a control in this state: no role, no tab
    // stop, never aria-disabled (the review's "dead grey button").
    expect(el.getAttribute('role')).toBeNull();
    expect(el.hasAttribute('tabindex')).toBe(false);
    expect(el.getAttribute('aria-disabled')).toBeNull();

    const chooseButton = el.querySelector('button');
    expect(chooseButton).not.toBeNull();
    expect(chooseButton.textContent).toBe('Choose files');
    chooseButton.click();
    expect(onChooseFiles).toHaveBeenCalledTimes(1);
  });

  it('preparing: aria-busy, honest label and render progress; a tap queues the download', () => {
    const onPreparingTap = vi.fn();
    mount({ state: 'preparing', totalCount: 18, renderedCount: 12, pagesToMerge: 18, onPreparingTap });
    const el = box();
    expect(el.getAttribute('aria-busy')).toBe('true');
    expect(el.textContent).toContain('Preparing 18 pages');
    expect(el.textContent).toContain('12 of 18 rendered');
    el.click();
    expect(onPreparingTap).toHaveBeenCalledTimes(1);
  });

  it('preparing: the label counts the merge output, not the render total (PART 2, browser check)', () => {
    // 18 cells still need rendering (one is skipped and still occupies a
    // cell), but the output the button is honestly promising is 17 pages.
    mount({ state: 'preparing', totalCount: 18, renderedCount: 12, pagesToMerge: 17 });
    const el = box();
    expect(el.textContent).toContain('Preparing 17 pages');
    expect(el.textContent).toContain('12 of 18 rendered');
  });

  it('ready: a real link with the page/size detail, full white on the primary teal', () => {
    mount({ state: 'ready', href: 'blob:x', fileName: 'merged.pdf', detail: '18 pages · 9.6 MB' });
    const el = container.querySelector('a[href="blob:x"]');
    expect(el).not.toBeNull();
    expect(el.getAttribute('role')).toBeNull();
    expect(el.textContent).toContain('Download merged PDF');
    expect(el.textContent).toContain('18 pages · 9.6 MB');
  });

  it('keeps the same DOM node across preparing -> ready, and draws the check only on the first ready', async () => {
    const { rerender } = mount({ state: 'preparing', totalCount: 2, renderedCount: 0 });
    const nodeAtPreparing = box();

    rerender({ state: 'ready', href: 'blob:x', fileName: 'merged.pdf', detail: '2 pages' });
    expect(box()).toBe(nodeAtPreparing);
    expect(box().querySelector(`.${styles['check-mark-animated']}`)).not.toBeNull();

    // An edit takes it back through preparing, then ready again - the same
    // node, and the check does not replay.
    rerender({ state: 'preparing', totalCount: 3, renderedCount: 1 });
    expect(box()).toBe(nodeAtPreparing);
    rerender({ state: 'ready', href: 'blob:y', fileName: 'merged.pdf', detail: '3 pages' });
    expect(box()).toBe(nodeAtPreparing);
    expect(box().querySelector(`.${styles['check-mark-animated']}`)).toBeNull();
    expect(box().querySelector(`.${styles['check-mark-static']}`)).not.toBeNull();
  });

  it('saved: success tint, the file name, and "download again" as the live link', () => {
    mount({ state: 'saved', href: 'blob:x', fileName: 'merged.pdf' });
    const el = container.querySelector('a[href="blob:x"]');
    expect(el).not.toBeNull();
    expect(el.textContent).toContain('Saved');
    expect(el.textContent).toContain('merged.pdf');
    expect(el.textContent).toContain('download again');
  });

  it('error: a muted "fix the file" state, not disabled', () => {
    mount({ state: 'error' });
    const el = box();
    expect(el.textContent).toContain('Fix the file above to merge');
    expect(el.hasAttribute('disabled')).toBe(false);
    expect(el.getAttribute('href')).toBeNull();
  });
});
