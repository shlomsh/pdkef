import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MergePhoneControls from './MergePhoneControls.tsx';
import { englishMergeMessages } from '../messages.ts';
import { sortOptionsOf } from '../lib/mergeView.ts';
import { englishShellMessages } from '#shell/shellMessages.ts';

type ControlsProps = Parameters<typeof MergePhoneControls>[0];

describe('MergePhoneControls', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  const mount = (props: Partial<ControlsProps> = {}) => {
    act(() => render(
      <MergePhoneControls
        fileCount={2}
        rearranged={false}
        sortMode="added"
        sortOptions={sortOptionsOf(englishMergeMessages)}
        onSortChange={() => {}}
        onResetOrder={() => {}}
        onAdd={() => {}}
        onClear={() => {}}
        t={englishMergeMessages}
        sm={englishShellMessages}
        {...props}
      />,
      container,
    ));
    return container.querySelector('[data-merge-file-controls]') as HTMLElement;
  };
  // What each control is, in document order.
  const order = (controls: HTMLElement) => Array.from(controls.children).flatMap((el) => {
    if (el.hasAttribute('data-quiet-row')) return Array.from(el.children).map((b) => b.textContent?.trim());
    if (el.querySelector('[aria-haspopup="listbox"]')) return ['sort'];
    if (el.hasAttribute('data-rearranged-note')) return ['reset-order'];
    return [el.textContent?.trim()];
  });

  it('lists Add files, Clear all files, then Sort', () => {
    expect(order(mount())).toEqual(['Add files', 'Clear all files', 'sort']);
  });

  it('keeps Sort and adds Reset order once pages were rearranged', () => {
    expect(order(mount({ rearranged: true }))).toEqual(['Add files', 'Clear all files', 'sort', 'reset-order']);
  });

  it('offers no Sort or Reset order for a single file', () => {
    expect(order(mount({ fileCount: 1, rearranged: true }))).toEqual(['Add files', 'Clear all files']);
  });

  it('gives Add files and Clear all files an icon each and calls the handlers', () => {
    const onAdd = vi.fn();
    const onClear = vi.fn();
    const controls = mount({ onAdd, onClear });
    const [add, clear] = Array.from(controls.querySelectorAll('[data-quiet-row] button'));
    expect(add.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(clear.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    act(() => (add as HTMLButtonElement).click());
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onClear).not.toHaveBeenCalled();
    act(() => (clear as HTMLButtonElement).click());
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('calls Reset order and carries no page-numbers checkbox', () => {
    const onResetOrder = vi.fn();
    const controls = mount({ rearranged: true, onResetOrder });
    act(() => (controls.querySelector('[data-rearranged-note] button') as HTMLButtonElement).click());
    expect(onResetOrder).toHaveBeenCalledTimes(1);
    expect(controls.querySelector('input[type="checkbox"]')).toBeNull();
  });
});
