import { render } from 'preact';
import { act } from 'preact/test-utils';
import Sortable from 'sortablejs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PdfScanTool from './PdfScanTool.tsx';
import { loadViewfinder } from './lib/camera/loadCamera.ts';
import { takeArrival } from '#lib/handoff/fileArrival.ts';
import { installToolHarness, type ToolHarness } from '../../test/harness/toolHarness.ts';
import { brokenPhoto, heicPhoto } from '../../test/support/scanPhotos.ts';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { waitUntil as waitFor } from '../../test/support/waitUntil.ts';

// Under the test's own 5 s limit, so a missing result fails on its assertion rather than on the clock.
const waitUntil = (check: () => unknown) => waitFor(check, { timeout: 4000 });

/**
 * The real island in jsdom. Node has no canvas, so every photo here is genuinely unreadable (its bytes are
 * no image): the page is guessed, has no preview and is marked failed, in Chromium as much as here. What a
 * readable page does stays in the browser runs.
 */
describe('PdfScanTool island', () => {
  let harness: ToolHarness;
  let container: HTMLDivElement;
  let mounted = false;

  beforeEach(() => {
    harness = installToolHarness({ trackIndexedDb: true });
    document.documentElement.removeAttribute('data-handoff-pending');
  });

  afterEach(async () => {
    unmount();
    // The draft restore and the hand-off intake read IndexedDB: they must end while the DOM still exists.
    await harness.settle();
    harness.restore();
  });

  function mount() {
    container = document.createElement('div');
    document.body.append(container);
    act(() => { render(<PdfScanTool />, container); });
    mounted = true;
  }

  function unmount() {
    if (!mounted) return;
    act(() => { render(null, container); });
    container.remove();
    mounted = false;
  }

  const all = <T extends HTMLElement = HTMLElement>(selector: string) => Array.from(container.querySelectorAll<T>(selector));
  const one = <T extends HTMLElement = HTMLElement>(selector: string) => {
    const el = container.querySelector<T>(selector);
    if (!el) throw new Error(`Expected ${selector}`);
    return el;
  };
  const withText = (selector: string, text: string) => {
    const el = all(selector).find((candidate) => candidate.textContent?.trim() === text);
    if (!el) throw new Error(`Expected ${selector} reading ${text}`);
    return el;
  };
  const tiles = () => all('[data-table-page]');
  const tileLabels = () => tiles().map((tile) => tile.getAttribute('aria-label')?.split(',')[0]);
  const text = () => container.textContent ?? '';
  const click = (el: HTMLElement) => act(async () => { el.click(); });
  const startScanning = () => withText('label', 'Start scanning');
  const pick = (files: File[]) => act(async () => { setInputFiles(one('input[type="file"]:not([capture])'), files); });
  /** Every photo is on the table and has been looked at: none is still being straightened. */
  const looked = (count: number) => waitUntil(() => {
    expect(tiles()).toHaveLength(count);
    expect(text()).not.toContain('Straightening');
  });
  const draftLine = () => container.querySelector('[data-draft-status]')?.textContent;
  const saved = () => waitUntil(() => expect(draftLine()).toBe('Draft saved'));
  const remount = () => {
    unmount();
    mount();
  };

  it('offers Start scanning on the empty state as an equal of Choose photos, wired to the rear camera', () => {
    mount();
    const take = startScanning();
    const choose = withText('label', 'Choose photos');
    expect(take.className.split(' ')).toContain(choose.className);
    const input = one('input[capture]');
    expect(input.getAttribute('capture')).toBe('environment');
    expect(input.getAttribute('accept')).toBe('image/jpeg,image/png');
  });

  it('lets the picker choose photos and PDFs', () => {
    mount();
    expect(one('input[type="file"]:not([capture])').getAttribute('accept')).toBe('image/jpeg,image/png,application/pdf');
  });

  it('adds one page per JPEG and names the skipped HEIC', async () => {
    mount();
    await pick([brokenPhoto('a.jpg'), brokenPhoto('b.jpg'), heicPhoto('c.heic')]);
    await looked(2);
    expect(tileLabels()).toEqual(['Page 1 of 2', 'Page 2 of 2']);
    expect(text()).toContain('c.heic was skipped');
    expect(container.querySelector('[data-page-viewer]')).toBeNull();
    expect(all('[role="group"] button')).toHaveLength(0);
  });

  describe('SCAN-66: the arrival source', () => {
    const accepted = async () => {
      await harness.flush();
      return harness.usageEvents('tool_file_accepted').map((event) => event.properties.source);
    };

    it('a photo through the Start scanning input is accepted as camera', async () => {
      mount();
      await act(async () => { setInputFiles(startScanning().querySelector('input'), [brokenPhoto('c.jpg')]); });
      await looked(1);
      expect(await accepted()).toEqual(['camera']);
      expect(takeArrival()).toBeUndefined();
    });

    it('a photo picked through the shell picker still reads pick', async () => {
      mount();
      await pick([brokenPhoto('p.jpg')]);
      await looked(1);
      expect(await accepted()).toEqual(['pick']);
    });
  });

  it('is a plain native input when the camera is not usable', async () => {
    mount();
    const input = startScanning().querySelector('input') as HTMLInputElement;
    let opened = 0;
    input.addEventListener('click', (event) => { opened += 1; event.preventDefault(); });
    await click(startScanning());
    expect(opened).toBe(1);
    await act(async () => { await loadViewfinder(); await drainPromises(); });
    expect(container.querySelector('dialog[aria-label="Start scanning"]')).toBeNull();
  });

  it('binds hold and drag to the table on desktop', async () => {
    const create = vi.spyOn(Sortable, 'create');
    mount();
    await pick([brokenPhoto('a.jpg'), brokenPhoto('b.jpg')]);
    await looked(2);
    expect(create.mock.calls.at(-1)?.[0]).toBe(tiles()[0].closest('ul'));
  });

  it('goes back to the default name when the file name is emptied', async () => {
    mount();
    await pick([brokenPhoto('a.jpg')]);
    await looked(1);
    const nameEl = () => one('h2 [contenteditable]');
    const rename = async (value: string) => {
      await act(async () => { nameEl().dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
      expect(nameEl().getAttribute('contenteditable')).toBe('plaintext-only');
      await act(async () => { nameEl().textContent = value; });
      await act(async () => { nameEl().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    };
    await rename('Contract');
    expect(nameEl().textContent).toBe('Contract');
    expect(nameEl().getAttribute('contenteditable')).toBe('false');
    await rename('');
    expect(nameEl().textContent).toMatch(/^Scan \d{1,2} [A-Z][a-z]{2} \d{4}$/);
  });

  describe('remembering the scan (SCAN-18)', () => {
    const recentRows = () => harness.recents();

    it('keeps one Recents row for a scan that grows a page at a time', async () => {
      mount();
      await pick([brokenPhoto('a.jpg')]);
      await looked(1);
      await saved();
      await pick([brokenPhoto('b.jpg')]);
      await looked(2);
      await saved();
      await pick([brokenPhoto('c.jpg')]);
      await looked(3);
      await waitUntil(() => expect(recentRows()[0]?.pageCount).toBe(3));
      await saved();
      expect(recentRows()).toHaveLength(1);
      expect(recentRows()[0]).toMatchObject({ tool: 'scan-to-pdf', pageCount: 3 });
    });

    it('lets photos handed over from Image to PDF start a new scan, not join the remembered one', async () => {
      mount();
      await pick([brokenPhoto('a.jpg')]);
      await looked(1);
      await saved();
      unmount();
      document.documentElement.setAttribute('data-handoff-pending', '1');
      mount();
      await waitUntil(() => expect(container.querySelector('[data-empty-state]')).not.toBeNull());
      await harness.settle();
      expect(tiles()).toHaveLength(0);
    });

    it('says it is checking for a remembered scan, then shows it', async () => {
      mount();
      await pick([brokenPhoto('a.jpg')]);
      await looked(1);
      await saved();
      unmount();
      document.documentElement.setAttribute('data-draft-hint', '1');
      mount();
      expect(text()).toContain('Checking');
      expect(container.querySelector('[data-empty-state]')).toBeNull();
      await looked(1);
    });

    it('forgets the scan once the last page is removed', async () => {
      mount();
      await pick([brokenPhoto('a.jpg')]);
      await looked(1);
      await saved();
      remount();
      await looked(1);
      await click(one('button[aria-label="Remove page 1"]'));
      await waitUntil(() => expect(recentRows()[0]?.hasWork ?? []).not.toContain('scan-to-pdf'));
      remount();
      await waitUntil(() => expect(container.querySelector('[data-empty-state], [data-table-page]')).not.toBeNull());
      await harness.settle();
      expect(tiles()).toHaveLength(0);
      expect(container.querySelector('[data-empty-state]')).not.toBeNull();
    });
  });

  it('Clear all during the Undo window empties the table and takes the chip with it', async () => {
    mount();
    await pick([brokenPhoto('a.jpg'), brokenPhoto('b.jpg'), brokenPhoto('c.jpg')]);
    await looked(3);
    await click(one('button[aria-label="Remove page 2"]'));
    await waitUntil(() => expect(container.querySelector('[data-undo-chip]')?.textContent).toContain('Page 2 removed'));
    await click(withText('button', 'Clear all files'));
    await click(withText('button', 'Clear all'));
    expect(container.querySelector('[data-undo-chip]')).toBeNull();
    expect(container.querySelector('[data-empty-state]')).not.toBeNull();
  });
});
