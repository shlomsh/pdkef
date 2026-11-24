import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MergeHeading, MergeHeaderStatus } from './MergeHeading.tsx';
import { englishMergeMessages } from '../messages.ts';
import { englishShellMessages } from '#shell/shellMessages.ts';

describe('MergeHeading', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  const mount = (props: Partial<Parameters<typeof MergeHeading>[0]> = {}) => {
    act(() => render(
      <MergeHeading
        title="merged_a"
        outputCount={4}
        skippedCount={0}
        stillRendering={false}
        renderedCount={0}
        onRename={() => {}}
        onRenamingChange={() => {}}
        t={englishMergeMessages}
        sm={englishShellMessages}
        {...props}
      />,
      container,
    ));
    return container.querySelector('#page-grid-heading') as HTMLElement;
  };

  it('names the output and counts its pages in the page-grid heading', () => {
    const heading = mount({ skippedCount: 2 });
    expect(heading.tagName).toBe('H2');
    expect(heading.textContent).toContain('Your merged PDF');
    expect(heading.textContent).toContain('4 pages');
    expect(heading.textContent).toContain('2 pages skipped');
  });

  it('says how many cells are rendered only while rendering, starting from none', () => {
    expect(mount({ stillRendering: true, renderedCount: 0 }).textContent).toContain('0 rendered');
    expect(mount({ stillRendering: true, renderedCount: 3 }).textContent).toContain('3 rendered');
    expect(mount({ stillRendering: false, renderedCount: 4 }).textContent).not.toContain('rendered');
  });

  it('keeps the merged_ prefix and the .pdf unit around a Hebrew name', () => {
    const heading = mount({ title: 'merged_אישור שנתי' });
    expect(heading.querySelector('span[contenteditable]')?.textContent).toBe('merged_אישור שנתי');
    expect(heading.querySelector('bdi [dir="ltr"]')?.textContent).toBe('.pdf');
    expect(heading.querySelector('span[contenteditable]')?.closest('bdi')?.parentElement).toBe(heading);
  });
});

describe('MergeHeaderStatus', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  const mount = (props: Partial<Parameters<typeof MergeHeaderStatus>[0]> = {}) => {
    act(() => render(
      <MergeHeaderStatus
        canUndo={false}
        canRedo={false}
        onUndo={() => {}}
        onRedo={() => {}}
        showPickedUp={false}
        showShortcuts={false}
        isRestoredWorkspace={false}
        onStartFresh={() => {}}
        t={englishMergeMessages}
        {...props}
      />,
      container,
    ));
  };
  const button = (label: string) => container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;

  it('enables Undo and Redo only when there is something to undo or redo, and calls them', () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    mount({ canUndo: true, canRedo: false, onUndo, onRedo });
    expect(button('Undo last change').disabled).toBe(false);
    expect(button('Redo last undone change').disabled).toBe(true);
    act(() => button('Undo last change').click());
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).not.toHaveBeenCalled();
  });

  it('shows the restored-draft sentence with Start fresh, in the header for phones', () => {
    const onStartFresh = vi.fn();
    mount({ showPickedUp: true, onStartFresh });
    const chip = container.querySelector('[role="status"]:has(button)') as HTMLElement;
    expect(chip.textContent).toContain('Picked up where you left off');
    const startFresh = Array.from(chip.querySelectorAll('button')).find((b) => b.textContent === 'Start fresh') as HTMLButtonElement;
    act(() => startFresh.click());
    expect(onStartFresh).toHaveBeenCalledTimes(1);
  });

  it('lets the restore sentence win over the shortcuts hint, and shows the hint alone otherwise', () => {
    mount({ showPickedUp: true, showShortcuts: true });
    expect(container.textContent).not.toContain('← → move');
    mount({ showPickedUp: false, showShortcuts: true });
    expect(container.querySelector('[role="status"]')?.textContent).toBe('← → move · R rotate · Del skip');
  });

  it('keeps one silent child in the slot after the sentence timed out in a restored workspace', () => {
    mount({ isRestoredWorkspace: true });
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('span[aria-hidden="true"]')).not.toBeNull();
  });
});
