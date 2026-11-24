import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DownloadElement from './DownloadElement.tsx';
import type { DownloadMessages } from './shellMessages.ts';

const messages: DownloadMessages = {
  addOneMore: 'Add one more file to merge',
  allSkipped: 'Every page is skipped',
  downloadAgain: 'download again',
  downloadLabel: 'Download merged PDF',
  buildFailed: 'Fix the file above to merge',
  preparingPages: 'Preparing {count} pages…',
  renderProgress: '{done} of {total} rendered',
  savedLabel: 'Saved',
};

type DownloadElementProps = Parameters<typeof DownloadElement>[0];

describe('DownloadElement', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  const mount = (props: Partial<DownloadElementProps> & Pick<DownloadElementProps, 'state'>) => {
    act(() => render(<DownloadElement messages={messages} {...props} />, container));
    return container.querySelector('a[data-state]') as HTMLAnchorElement;
  };

  it('starts the build at once on pointerdown, so a tap does not wait for the quiet time', () => {
    const onWarm = vi.fn();
    const box = mount({ state: 'ready', onWarm });
    act(() => { box.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(onWarm).toHaveBeenCalledTimes(1);
  });

  it('warms on hover and on focus as well', () => {
    const onWarm = vi.fn();
    const box = mount({ state: 'ready', onWarm });
    act(() => { box.dispatchEvent(new Event('pointerenter')); });
    act(() => { box.dispatchEvent(new Event('focus')); });
    expect(onWarm).toHaveBeenCalledTimes(2);
  });

  it('says every page is skipped, not that it is preparing, and does nothing on a tap', () => {
    const onPreparingTap = vi.fn();
    const onDownloadClick = vi.fn();
    const box = mount({ state: 'nothing', pageCount: 0, onPreparingTap, onDownloadClick });
    expect(box.textContent).toContain('Every page is skipped');
    expect(box.textContent).not.toContain('Preparing 0');
    expect(box.getAttribute('aria-disabled')).toBe('true');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => { box.dispatchEvent(click); });
    expect(click.defaultPrevented).toBe(true);
    expect(onPreparingTap).not.toHaveBeenCalled();
    expect(onDownloadClick).not.toHaveBeenCalled();
  });

  it('shows the one-file state as a plain surface whose only control is Choose files', () => {
    const onChooseFiles = vi.fn();
    const onPreparingTap = vi.fn();
    const box = mount({ state: 'one-file', chooseFilesLabel: 'Choose files', onChooseFiles, onPreparingTap });
    expect(box.textContent).toContain('Add one more file to merge');
    expect(box.getAttribute('role')).toBeNull();
    expect(box.hasAttribute('tabindex')).toBe(false);
    act(() => { box.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(onChooseFiles).not.toHaveBeenCalled();
    const button = box.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toBe('Choose files');
    act(() => button.click());
    expect(onChooseFiles).toHaveBeenCalledTimes(1);
    expect(onPreparingTap).not.toHaveBeenCalled();
  });

  it('counts the output pages while preparing, not the render total', () => {
    const box = mount({ state: 'preparing', pageCount: 4, renderedCount: 1, totalCount: 6, progress: 0.5 });
    expect(box.textContent).toContain('Preparing 4 pages…');
    expect(box.textContent).toContain('1 of 6 rendered');
    expect(box.getAttribute('aria-busy')).toBe('true');
  });

  it('is a download link only once there is a href, and then only observes the tap', () => {
    const onDownloadClick = vi.fn((event: MouseEvent) => event.preventDefault());
    const onPreparingTap = vi.fn();
    const box = mount({ state: 'ready', href: 'blob:merged', fileName: 'merged_a.pdf', detail: '4 pages · 9 KB', onDownloadClick, onPreparingTap });
    expect(box.getAttribute('href')).toBe('blob:merged');
    expect(box.getAttribute('download')).toBe('merged_a.pdf');
    expect(box.textContent).toContain('4 pages · 9 KB');
    act(() => { box.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(onDownloadClick).toHaveBeenCalledTimes(1);
    expect(onPreparingTap).not.toHaveBeenCalled();
  });

  it('treats a tap on a ready state without a link yet as a tap that beat the build', () => {
    const onPreparingTap = vi.fn();
    const onDownloadClick = vi.fn();
    const box = mount({ state: 'ready', href: null, onPreparingTap, onDownloadClick });
    expect(box.hasAttribute('href')).toBe(false);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => { box.dispatchEvent(click); });
    expect(click.defaultPrevented).toBe(true);
    expect(onPreparingTap).toHaveBeenCalledTimes(1);
    expect(onDownloadClick).not.toHaveBeenCalled();
  });

  it('shows the saved state with a download-again line', () => {
    const box = mount({ state: 'saved', href: 'blob:merged', fileName: 'merged_a.pdf', detail: '4 pages · 9 KB' });
    expect(box.textContent).toContain('Saved');
    expect(box.textContent).toContain('download again');
  });

  it('shows the given error message, or the catalogue one when there is none', () => {
    expect(mount({ state: 'error', errorMessage: 'Fix it' }).textContent).toBe('Fix it');
    expect(mount({ state: 'error' }).textContent).toBe(messages.buildFailed);
  });

  it('claims first-ready focus once there is a link, but not while the name is being renamed', () => {
    const renaming = mount({ state: 'ready', href: 'blob:merged', isOutputNameBeingRenamed: true });
    expect(document.activeElement).not.toBe(renaming);
    const done = mount({ state: 'ready', href: 'blob:merged', isOutputNameBeingRenamed: false });
    expect(document.activeElement).toBe(done);
  });
});
