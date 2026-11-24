import { render, type ComponentChildren } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MergeRailPinned from './MergeRailPinned.tsx';
import { useMergeTool } from '../hooks/useMergeTool.ts';
import { DEFAULT_QUIET } from '#lib/output/quietPrepare.ts';
import { englishMergeMessages as t } from '../messages.ts';
import { englishShellMessages as sm } from '#shell/shellMessages.ts';
import type { BeforeInstallPromptEvent } from '../state/mergeState.ts';
import { installToolHarness, type ToolHarness } from '../../../test/harness/toolHarness.ts';
import { pagesPdf } from '../../../test/support/mergeFixtures.ts';
import { waitUntil } from '../../../test/support/waitUntil.ts';

type View = ReturnType<typeof useMergeTool>;

const twoPages = (name: string) => pagesPdf([100, 100], name);

type PinnedProps = Parameters<typeof MergeRailPinned>[0];
type Extra = Partial<Omit<PinnedProps, 'downloadFlow' | 'prepared'>>;

describe('MergeRailPinned', () => {
  let container: HTMLElement;
  let harness: ToolHarness;
  let view: View;

  function Probe({ children }: { children: (current: View) => ComponentChildren }) {
    view = useMergeTool();
    return <>{children(view)}</>;
  }

  beforeEach(() => {
    harness = installToolHarness({ trackIndexedDb: true });
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(async () => {
    act(() => render(null, container));
    container.remove();
    // The hand-off intake's IndexedDB read must end while the DOM still exists.
    vi.useRealTimers();
    await harness.settle();
    harness.restore();
  });

  const mount = async (files: File[], { build = false, ...extra }: Extra & { build?: boolean } = {}) => {
    if (!build) vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    act(() => render(
      <Probe>
        {({ workspace }) => (
          <MergeRailPinned
            fileCount={workspace.entries.length}
            addPageNumbers={false}
            onPageNumbersChange={() => {}}
            lockedView={false}
            downloadFlow={workspace.downloadFlow}
            prepared={workspace.prepared}
            fileName={workspace.fileName}
            detail="4 pages"
            renderedCount={0}
            renderTotal={4}
            outputCount={4}
            hasFailedEntry={false}
            isOutputNameBeingRenamed={false}
            onChooseFiles={() => {}}
            onStartAgain={() => {}}
            showInstallLine={false}
            installPrompt={null}
            onIos={false}
            onInstall={() => {}}
            t={t}
            sm={sm}
            {...extra}
          />
        )}
      </Probe>,
      container,
    ));
    await act(async () => { view.base.onFilesAdded(files); });
    await waitUntil(() => view.workspace.entries.length === files.length && view.workspace.entries.every((entry) => entry.pageCount !== null || entry.error), { dueFakeTimers: vi.isFakeTimers() });
    // As a hover on Download asks for the output at once.
    if (build) act(() => view.workspace.prepared.prepareNow());
  };
  const box = () => container.querySelector('a[data-state]') as HTMLAnchorElement;
  const buttonLabels = () => Array.from(container.querySelectorAll('button')).map((b) => b.textContent?.trim());
  const readyLink = async () => {
    await waitUntil(() => expect(box().getAttribute('href')).toBeTruthy());
    return box();
  };
  // The anchor's own navigation is jsdom's to refuse; the product's handler has run before the click reaches the container.
  const tapDownload = (link: HTMLAnchorElement) => act(() => {
    container.addEventListener('click', (event) => event.preventDefault(), { once: true });
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });

  it('asks for one more file with one file, with Choose files as the only way on', async () => {
    const onChooseFiles = vi.fn();
    await mount([await twoPages('a.pdf')], { onChooseFiles });
    expect(box().getAttribute('data-state')).toBe('one-file');
    expect(box().textContent).toContain('Add one more file to merge');
    expect(box().hasAttribute('href')).toBe(false);
    expect(buttonLabels()).toEqual(['Choose files']);
    expect(container.querySelector('details')).toBeNull();
    expect(container.querySelector('[data-count]')).toBeNull();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    act(() => (box().querySelector('button') as HTMLButtonElement).click());
    expect(onChooseFiles).toHaveBeenCalledTimes(1);
  });

  it('brings back the hand-off row and one page-numbers checkbox once there are two files', async () => {
    const onPageNumbersChange = vi.fn();
    await mount([await twoPages('a.pdf'), await twoPages('b.pdf')], { onPageNumbersChange });
    expect(container.querySelector('[data-count]')).not.toBeNull();
    expect(buttonLabels()).toContain('Compress');
    expect(buttonLabels()).toContain('Sign');
    expect(buttonLabels()).not.toContain('Options');
    expect(container.querySelector('details')).toBeNull();
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(1);
    act(() => (checkboxes[0] as HTMLInputElement).click());
    expect(onPageNumbersChange).toHaveBeenCalledTimes(1);
  });

  it('turns Download into a link named after the output once the merge is ready', async () => {
    await mount([await twoPages('a.pdf'), await twoPages('b.pdf')], { build: true });
    const link = await readyLink();
    expect(link.getAttribute('data-state')).toBe('ready');
    expect(link.getAttribute('download')).toBe('merged_a.pdf');
    expect(link.textContent).toContain('4 pages');
    expect(harness.blobForUrl(link.getAttribute('href'))?.type).toBe('application/pdf');
  });

  it('shows Start again only after a download, and calls it', async () => {
    const onStartAgain = vi.fn();
    await mount([await twoPages('a.pdf'), await twoPages('b.pdf')], { build: true, onStartAgain });
    const link = await readyLink();
    expect(buttonLabels()).not.toContain('Start again');
    tapDownload(link);
    expect(box().getAttribute('data-state')).toBe('saved');
    const startAgain = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Start again') as HTMLButtonElement;
    act(() => startAgain.click());
    expect(onStartAgain).toHaveBeenCalledTimes(1);
  });

  it('keeps the install line for the saved state, and only when it is due', async () => {
    await mount([await twoPages('a.pdf'), await twoPages('b.pdf')], { build: true, showInstallLine: true });
    const link = await readyLink();
    expect(container.querySelector('[data-install-line]')).toBeNull();
    tapDownload(link);
    expect(container.querySelector('[data-install-line]')?.textContent).toContain('works even without a connection');
    expect(container.querySelector('[data-install-line]')?.textContent).toContain(t.installOther);
  });

  it('shows no install line in the saved state when it is not due', async () => {
    await mount([await twoPages('a.pdf'), await twoPages('b.pdf')], { build: true, showInstallLine: false });
    tapDownload(await readyLink());
    expect(container.querySelector('[data-install-line]')).toBeNull();
  });

  it('offers the browser install prompt as a link in the install line, and the iOS wording on iOS', async () => {
    const onInstall = vi.fn();
    const installPrompt: BeforeInstallPromptEvent = Object.assign(new Event('beforeinstallprompt'), { prompt: () => Promise.resolve() });
    await mount([await twoPages('a.pdf'), await twoPages('b.pdf')], { build: true, showInstallLine: true, installPrompt, onInstall });
    tapDownload(await readyLink());
    const install = container.querySelector('[data-install-line] button') as HTMLButtonElement;
    expect(install.textContent).toBe('install');
    act(() => install.click());
    expect(onInstall).toHaveBeenCalledTimes(1);
    act(() => render(null, container));
    await mount([await twoPages('a.pdf'), await twoPages('b.pdf')], { build: true, showInstallLine: true, onIos: true });
    tapDownload(await readyLink());
    expect(container.querySelector('[data-install-line]')?.textContent).toContain(t.installIos);
  });

  describe('asks for the output before the quiet wait ends', () => {
    const waitingSet = async () => {
      await mount([await twoPages('a.pdf'), await twoPages('b.pdf')]);
      expect(box().hasAttribute('href')).toBe(false);
    };
    // forced: the fake clock moves a millisecond a tick and stops well short of the quiet wait, so only a request can bring the build in.
    const buildStarts = () => {
      let elapsed = 0;
      return waitUntil(() => {
        if (elapsed < DEFAULT_QUIET.baseMs / 3) vi.advanceTimersByTime(1);
        elapsed += 1;
        expect(box().getAttribute('href')).toBeTruthy();
      });
    };

    it.each([
      ['pointerdown', () => new PointerEvent('pointerdown', { bubbles: true })],
      ['pointerenter', () => new PointerEvent('pointerenter')],
      ['focus', () => new FocusEvent('focus')],
    ])('on %s over Download', async (_name, makeEvent) => {
      await waitingSet();
      act(() => { box().dispatchEvent(makeEvent()); });
      await buildStarts();
    });

    it.each([
      ['pointerdown', () => new PointerEvent('pointerdown', { bubbles: true })],
      ['pointerover', () => new PointerEvent('pointerover', { bubbles: true })],
      ['focusin', () => new FocusEvent('focusin', { bubbles: true })],
    ])('on %s over the hand-off row', async (_name, makeEvent) => {
      await waitingSet();
      act(() => { (container.querySelector('[data-count]') as HTMLElement).dispatchEvent(makeEvent()); });
      await buildStarts();
    });
  });

  it('shows no Download element in the locked view', async () => {
    await mount([await twoPages('a.pdf')], { lockedView: true });
    expect(container.querySelector('a[data-state]')).toBeNull();
  });
});
