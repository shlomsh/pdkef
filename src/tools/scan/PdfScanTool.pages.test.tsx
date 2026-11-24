import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PdfScanTool from './PdfScanTool.tsx';
import { installToolHarness, type ToolHarness } from '../../test/harness/toolHarness.ts';
import { brokenPhoto } from '../../test/support/scanPhotos.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { waitUntil as waitFor } from '../../test/support/waitUntil.ts';
import { englishScanMessages as t } from './messages.ts';

const waitUntil = (check: () => unknown, timeout = 4000) => waitFor(check, { timeout });

describe('PdfScanTool pages', () => {
  let harness: ToolHarness;
  let container: HTMLElement;
  beforeEach(() => {
    harness = installToolHarness({ trackIndexedDb: true });
    container = document.createElement('div');
    document.body.append(container);
  });
  afterEach(async () => {
    act(() => render(null, container));
    container.remove();
    await harness.settle();
    vi.restoreAllMocks();
    harness.restore();
  });

  const all = (selector: string) => Array.from(container.querySelectorAll<HTMLElement>(selector));
  const one = (selector: string) => {
    const el = container.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`Expected ${selector}`);
    return el;
  };
  const tiles = () => all('[data-table-page]');
  const labelled = (label: string) => one(`button[aria-label="${label}"]`);
  const click = (el: HTMLElement) => act(async () => { el.click(); });
  const keyOn = (el: HTMLElement, key: string, more: KeyboardEventInit = {}) => act(async () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, ...more, bubbles: true, cancelable: true }));
  });
  const chip = () => container.querySelector('[data-undo-chip]');
  const announced = () => container.querySelector('[role="status"]')?.textContent;
  const viewerOpen = () => container.querySelector('[data-page-viewer]') !== null;

  /** The photos are on the table and every one has been read, which for these bytes means it could not be. */
  async function pick(names: string[]) {
    act(() => { render(<PdfScanTool />, container); });
    const input = one('input[type="file"]:not([capture])');
    await act(async () => { setInputFiles(input, names.map((name) => brokenPhoto(name))); });
    await waitUntil(() => {
      expect(tiles()).toHaveLength(names.length);
      for (const tile of tiles()) expect(tile.textContent).toContain(t.pageFailed);
    }, 2000);
  }

  it('Delete on a tile removes that page, and R turns it', async () => {
    await pick(['a.jpg', 'b.jpg', 'c.jpg']);
    await keyOn(tiles()[1], 'r', { code: 'KeyR' });
    await waitUntil(() => expect(announced()).toBe('Page 2 turned a quarter to the right.'));
    await keyOn(tiles()[1], 'Delete');
    expect(tiles()).toHaveLength(2);
    expect(chip()?.textContent).toContain('Page 2 removed');
    await keyOn(tiles()[0], 'Backspace');
    expect(tiles()).toHaveLength(1);
  });

  it('the R key is the same key on a Hebrew keyboard', async () => {
    await pick(['a.jpg', 'b.jpg', 'c.jpg']);
    await keyOn(tiles()[0], 'ר', { code: 'KeyR' });
    await waitUntil(() => expect(announced()).toBe('Page 1 turned a quarter to the right.'));
  });

  it('holding Delete takes one page, so Undo can always bring it back', async () => {
    await pick(['a.jpg', 'b.jpg', 'c.jpg']);
    await keyOn(tiles()[0], 'Delete');
    await keyOn(tiles()[0], 'Delete', { repeat: true });
    expect(tiles()).toHaveLength(2);
  });

  it('a click on the Rotate or Remove button of a page never opens the page', async () => {
    await pick(['a.jpg', 'b.jpg', 'c.jpg']);
    await click(labelled('Rotate page 1'));
    expect(announced()).toBe('Page 1 turned a quarter to the right.');
    expect(viewerOpen()).toBe(false);
    await click(labelled('Remove page 1'));
    expect(tiles()).toHaveLength(2);
    expect(viewerOpen()).toBe(false);
  });

  it('the only page goes at once, with no Undo', async () => {
    await pick(['a.jpg']);
    await click(labelled('Remove page 1'));
    await waitUntil(() => expect(container.querySelector('[data-empty-state]')).not.toBeNull());
    expect(chip()).toBeNull();
  });

  it('a photo that could not be read says so on its tile', async () => {
    await pick(['a.jpg', 'b.jpg']);
    expect(tiles().map((tile) => tile.textContent)).toEqual([`${t.pageFailed}1`, `${t.pageFailed}2`]);
  });

  it('Undo on the chip of the grid puts an unreadable page back in its place', async () => {
    await pick(['a.jpg', 'b.jpg', 'c.jpg']);
    const labels = tiles().map((tile) => tile.getAttribute('aria-label'));
    await click(labelled('Remove page 2'));
    expect(tiles()).toHaveLength(2);
    expect(chip()?.textContent).toContain('Page 2 removed');
    await click(one('[data-undo-chip] button'));
    expect(tiles().map((tile) => tile.getAttribute('aria-label'))).toEqual(labels);
    expect(chip()).toBeNull();
  });

  it('a photo taken from the Add pages tile joins the pages', async () => {
    await pick(['a.jpg', 'b.jpg']);
    await act(async () => { setInputFiles(one('[data-add-pages] input[capture]'), [brokenPhoto('c.jpg')]); });
    await waitUntil(() => expect(tiles()).toHaveLength(3), 2000);
  });

  it('the pick-more button of the Add pages tile opens the picker of the shell', async () => {
    await pick(['a.jpg']);
    const clicked = vi.spyOn(HTMLInputElement.prototype, 'click');
    await click(one('[data-add-pick]'));
    expect(clicked.mock.contexts).toEqual([one('input[type="file"]:not([capture])')]);
  });
});
