// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import Sortable from 'sortablejs';
import PdfImageToPdfTool from './PdfImageToPdfTool.tsx';
import * as imageToPdfLib from '../../lib/imagesToPdf.js';
import styles from './PdfImageToPdfTool.module.css';
import outputNameStyles from '../../shell/OutputName.module.css';
import sortMenuStyles from '../../shell/SortMenu.module.css';
import dropzoneStyles from '../../shell/Dropzone.module.css';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import toolShellStyles from '../../shell/ToolShell.module.css';
import { mockNativeFileShare } from '../../test/support/mockFileShare.js';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { recentActions, resetActionTrailForTests } from '../../lib/actionTrail.ts';
import { reportToolLifecycleEvent } from '../../lib/productAnalytics.ts';
import { hebrewImageToPdfMessages } from './messages';
import { hebrewShellMessages } from '../../shell/shellMessages';

vi.mock('../../lib/productAnalytics.ts', async (importOriginal) => ({
  ...(await importOriginal()),
  reportToolLifecycleEvent: vi.fn(),
}));

function makeImageFile(name, type = 'image/png') {
  return new File(['fake-image-bytes'], name, { type });
}


const { takeHandoffMock, saveHandoffMock } = vi.hoisted(() => ({
  takeHandoffMock: vi.fn(() => Promise.resolve(null)),
  saveHandoffMock: vi.fn(() => Promise.resolve(true)),
}));

// SITE-42: the home page hands picked files over through the draft store's hand-off slot.
vi.mock('../../lib/drafts/draftStore.js', async (importOriginal) => ({
  ...(await importOriginal()),
  takeHandoff: takeHandoffMock,
  saveHandoff: saveHandoffMock,
}));

vi.mock('../../lib/imagesToPdf.js', () => ({
  imagesToPdf: vi.fn(() => Promise.resolve(new Blob(['%PDF-1.4'], { type: 'application/pdf' }))),
  UnsupportedImageError: class UnsupportedImageError extends Error {},
}));


const QUIET = { baseMs: 100, stepMs: 50, maxMs: 300, burstWindowMs: 1000 };
const pdfBlob = () => new Blob(['%PDF-1.4'], { type: 'application/pdf' });

describe('PdfImageToPdfTool UI flow', () => {
  let container;
  let originalCreateObjectURL;
  let originalRevokeObjectURL;
  const build = () => vi.mocked(imageToPdfLib.imagesToPdf);

  beforeEach(() => {
    vi.useFakeTimers();
    originalCreateObjectURL = window.URL.createObjectURL;
    originalRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:testurl');
    window.URL.revokeObjectURL = vi.fn();
    build().mockClear();
    build().mockImplementation(() => Promise.resolve(pdfBlob()));
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function mount(props = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfImageToPdfTool quietPolicy={QUIET} {...props} />, container);
    });
  }

  async function loadFiles(names = ['a.png', 'b.jpg']) {
    const input = container.querySelector('input[type="file"]');
    const files = names.map((n) => makeImageFile(n, n.endsWith('.jpg') ? 'image/jpeg' : 'image/png'));
    await act(async () => {
      setInputFiles(input, files);
    });
  }

  const wait = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  const tileNames = () => Array.from(container.querySelectorAll(`.${styles.page}`)).map((el) => el.getAttribute('aria-label').split(',')[0]);
  const removeButtons = () => container.querySelectorAll(`.${styles.remove}`);
  const downloadLink = () => container.querySelector(`.${pdfToolStyles['download-button']}`);
  const press = (el, key) => act(async () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });

  it('renders the initial file dropper zone', () => {
    mount();
    const dropzone = container.querySelector(`.${dropzoneStyles.dropzone}`);
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop images here');
  });

  it('shows one page tile per image, with a number, and no Convert button', async () => {
    mount();
    await loadFiles(['one.png', 'two.png']);

    const identity = container.querySelector(`.${toolShellStyles.name}`);
    expect(identity.textContent).toContain('2 images');
    expect(tileNames()).toEqual(['one.png', 'two.png']);
    expect(Array.from(container.querySelectorAll(`.${styles.badge}`)).map((b) => b.textContent)).toEqual(['1', '2']);
    expect(container.querySelector(`.${pdfToolStyles['tool-primary-action']}`)).toBeNull();
    expect(container.textContent).not.toContain('Convert');
    expect(container.querySelector(`.${styles['add-button']}`).textContent).toContain('Add images');
  });

  it('revokes every thumbnail URL on unmount, including ones added after the first render', async () => {
    let n = 0;
    const created = [];
    window.URL.createObjectURL = vi.fn((source) => {
      const url = `blob:thumb-${++n}`;
      // Thumbnails only: the PDF's own URL is usePreparedOutput's, and it is revoked as soon as the order changes.
      if (source.type.startsWith('image/')) created.push(url);
      return url;
    });
    mount();
    await loadFiles(['a.png']);
    await loadFiles(['b.jpg', 'c.png']);
    expect(created.length).toBeGreaterThanOrEqual(3);
    window.URL.revokeObjectURL.mockClear();

    act(() => render(null, container));

    const revoked = window.URL.revokeObjectURL.mock.calls.map((c) => c[0]);
    for (const url of created) expect(revoked).toContain(url);
  });

  it('skips non-image files and shows a hint', async () => {
    mount();
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      setInputFiles(input, [makeImageFile('doc.pdf', 'application/pdf')]);
    });
    const hint = container.querySelector(`.${pdfToolStyles['hint-message']}`);
    expect(hint.textContent).toContain('not a JPG or PNG');
  });

  it('builds at once on the first pick, without a button, and offers the download with its size', async () => {
    const nativeShare = mockNativeFileShare();
    mount();
    await loadFiles(['doc1.png', 'doc2.jpg']);
    await wait(0);

    expect(build()).toHaveBeenCalledTimes(1);
    expect(build().mock.calls[0][0].map((f) => f.name)).toEqual(['doc1.png', 'doc2.jpg']);
    expect(build().mock.calls[0][2]).toBeInstanceOf(AbortSignal);
    const link = downloadLink();
    expect(link.getAttribute('href')).toBe('blob:testurl');
    expect(link.getAttribute('download')).toBe('doc1.pdf');
    expect(link.textContent).toContain('Download PDF');
    expect(link.textContent).toContain('8 B');

    const shareButton = container.querySelector(`.${pdfToolStyles['pdf-share-button']}`);
    expect(shareButton).not.toBeNull();
    await act(async () => shareButton.click());
    expect(nativeShare.share.mock.calls[0][0].files[0].name).toBe('doc1.pdf');
    nativeShare.restore();
  });

  it('builds a burst of changes once, after the quiet wait, and keeps the ready look meanwhile', async () => {
    mount();
    await loadFiles(['a.png', 'b.png', 'c.png']);
    await wait(0);
    expect(build()).toHaveBeenCalledTimes(1);

    await act(async () => { removeButtons()[0].click(); });
    await wait(20);
    await act(async () => { removeButtons()[0].click(); });
    await wait(60);
    expect(build()).toHaveBeenCalledTimes(1);
    // Silent: no ring, the button is still the download button.
    expect(downloadLink()).not.toBeNull();
    expect(container.textContent).not.toContain('Preparing');

    await wait(300);
    expect(build()).toHaveBeenCalledTimes(2);
    expect(build().mock.calls[1][0].map((f) => f.name)).toEqual(['c.png']);
  });

  it('shows Preparing on a tap before ready, then delivers the download when the build lands', async () => {
    const clicks = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    mount();
    await loadFiles(['a.png', 'b.png']);
    await wait(0);
    let release;
    build().mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(pdfBlob()); }));
    await act(async () => { removeButtons()[1].click(); });

    await act(async () => { downloadLink().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    await wait(0);
    expect(container.querySelector(`.${pdfToolStyles['is-processing']}`).textContent).toContain('Preparing');
    expect(clicks).not.toHaveBeenCalled();

    await act(async () => { release(); });
    await wait(0);
    expect(container.querySelector(`.${pdfToolStyles['is-processing']}`)).toBeNull();
    expect(downloadLink().getAttribute('href')).toBe('blob:testurl');
    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it('records export on a tap that beat the build and download when it is delivered', async () => {
    resetActionTrailForTests();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    mount();
    await loadFiles(['a.png', 'b.png']);
    await wait(0);
    let release;
    build().mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(pdfBlob()); }));
    await act(async () => { removeButtons()[1].click(); });
    resetActionTrailForTests();
    await act(async () => { downloadLink().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(recentActions()).toEqual(['export']);
    await act(async () => { release(); });
    await wait(0);
    expect(recentActions()).toEqual(['export', 'download']);
  });

  it('names the download from the editable output name', async () => {
    mount();
    await loadFiles(['holiday.jpg', 'b.png']);
    await wait(0);
    const nameEl = () => container.querySelector(`.${outputNameStyles.name}`);
    expect(nameEl().textContent).toBe('holiday');

    await act(async () => { nameEl().dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    await act(async () => { nameEl().textContent = 'Trip album'; });
    await press(nameEl(), 'Enter');
    await wait(0);

    expect(nameEl().textContent).toBe('Trip album');
    expect(downloadLink().getAttribute('download')).toBe('Trip album.pdf');
  });

  it('removes an image when its x is clicked, and changes the order key', async () => {
    mount();
    await loadFiles(['one.png', 'two.png']);
    await wait(0);
    expect(removeButtons()[0].getAttribute('aria-label')).toBe('Remove one.png');
    await act(async () => { removeButtons()[0].click(); });
    expect(tileNames()).toEqual(['two.png']);
    await wait(500);
    expect(build()).toHaveBeenCalledTimes(2);
  });

  it('moves a tile with the arrow keys, announces it, and builds the new order', async () => {
    mount();
    await loadFiles(['one.png', 'two.png', 'three.png']);
    await wait(0);
    const tiles = () => container.querySelectorAll(`.${styles.page}`);
    await press(tiles()[0], 'ArrowRight');
    expect(tileNames()).toEqual(['two.png', 'one.png', 'three.png']);
    expect(container.querySelector('[role="status"][aria-live="polite"]').textContent).toBe('one.png moved to position 2 of 3.');
    await press(tiles()[1], 'ArrowDown');
    expect(tileNames()).toEqual(['two.png', 'three.png', 'one.png']);
    await press(tiles()[2], 'ArrowRight');
    expect(tileNames()).toEqual(['two.png', 'three.png', 'one.png']);
    await press(tiles()[2], 'ArrowLeft');
    expect(tileNames()).toEqual(['two.png', 'one.png', 'three.png']);

    await wait(600);
    expect(build()).toHaveBeenCalledTimes(2);
    expect(build().mock.calls[1][0].map((f) => f.name)).toEqual(['two.png', 'one.png', 'three.png']);
  });

  it('goes back to an order already built without building again', async () => {
    mount();
    await loadFiles(['one.png', 'two.png']);
    await wait(0);
    const tiles = () => container.querySelectorAll(`.${styles.page}`);
    await press(tiles()[0], 'ArrowRight');
    await wait(600);
    expect(build()).toHaveBeenCalledTimes(2);
    await press(tiles()[1], 'ArrowLeft');
    await wait(600);
    expect(build()).toHaveBeenCalledTimes(2);
    expect(downloadLink().getAttribute('href')).toBe('blob:testurl');
  });

  it('orders by name from the Order menu, then shows Your order after a manual move', async () => {
    mount();
    await loadFiles(['b.png', 'c.png', 'a.png']);
    await wait(0);
    const trigger = () => container.querySelector('button[aria-haspopup="listbox"]');
    expect(trigger().getAttribute('aria-label')).toBe('Order images: Your order');
    await act(async () => trigger().click());
    await act(async () => { document.querySelector(`.${sortMenuStyles['sort-option']}[data-value="nameAsc"]`).click(); });
    expect(tileNames()).toEqual(['a.png', 'b.png', 'c.png']);
    expect(trigger().getAttribute('aria-label')).toBe('Order images: Name A–Z');

    await press(container.querySelector(`.${styles.page}`), 'ArrowRight');
    expect(trigger().getAttribute('aria-label')).toBe('Order images: Your order');
  });

  it('attaches a Sortable instance to the page grid, with no handle and a touch hold', async () => {
    const createSpy = vi.spyOn(Sortable, 'create');
    mount();
    expect(createSpy).not.toHaveBeenCalled();
    await loadFiles(['a.png', 'b.png']);
    const grid = container.querySelector(`ul.${styles.grid}`);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(grid, expect.objectContaining({ delay: 150, delayOnTouchOnly: true }));
    expect(createSpy.mock.calls[0][1].handle).toBeUndefined();
  });

  it('shows the damaged-file message with Try again, which builds again', async () => {
    mount();
    build().mockImplementationOnce(() => Promise.reject(new Error('bad image')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await loadFiles(['a.png']);
    await wait(0);
    expect(container.querySelector('[role="alert"]').textContent).toContain('A file may be damaged - remove it and try again.');
    const retry = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    expect(retry.textContent).toContain('Try again');
    await act(async () => { retry.click(); });
    await wait(0);
    expect(build()).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(downloadLink()).not.toBeNull();
  });

  it('records what the person did, by name only, in order', async () => {
    resetActionTrailForTests();
    mount();
    await loadFiles(['a.png', 'b.jpg']);
    await wait(0);
    await act(async () => { removeButtons()[0].click(); });
    await wait(600);
    expect(recentActions()).toEqual(['add_files', 'remove_file']);
    await act(async () => { downloadLink().addEventListener('click', (e) => e.preventDefault()); downloadLink().click(); });
    expect(recentActions()).toEqual(['add_files', 'remove_file', 'export', 'download']);
  });

  it('loads photos handed off from the home page, in pick order', async () => {
    takeHandoffMock.mockResolvedValueOnce({
      files: [
        { fileName: 'first.jpg', fileType: 'image/jpeg', fileBytes: new Uint8Array(2).buffer },
        { fileName: 'second.png', fileType: 'image/png', fileBytes: new Uint8Array(3).buffer },
      ],
    });
    mount();
    await wait(0);
    expect(takeHandoffMock).toHaveBeenCalledWith('image-to-pdf');
    expect(tileNames()).toEqual(['first.jpg', 'second.png']);
  });

  const resultEvents = () => reportToolLifecycleEvent.mock.calls.filter(([event]) => event === 'tool_result_ready');

  it('reports no result for background builds, and exactly one for a tap then delivery', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    reportToolLifecycleEvent.mockClear();
    mount();
    await loadFiles(['a.png', 'b.png', 'c.png']);
    await wait(0);
    await act(async () => { removeButtons()[0].click(); });
    await wait(600);
    await act(async () => { removeButtons()[0].click(); });
    await wait(600);
    expect(build()).toHaveBeenCalledTimes(3);
    expect(resultEvents()).toHaveLength(0);

    await act(async () => { downloadLink().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    await wait(0);
    expect(resultEvents()).toHaveLength(1);
  });

  const tapDownload = () => act(async () => { downloadLink().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });

  it('does not deliver a stale tap after the only image is removed and a good one is added', async () => {
    const clicks = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let fail;
    build().mockImplementationOnce(() => new Promise((_, reject) => { fail = () => reject(new Error('bad image')); }));
    mount();
    await loadFiles(['a.png']);
    await wait(0);
    await tapDownload();
    await act(async () => { fail(); });
    await wait(0);
    await act(async () => { removeButtons()[0].click(); });
    await loadFiles(['b.png']);
    await wait(600);
    expect(build()).toHaveBeenCalledTimes(2);
    expect(clicks).not.toHaveBeenCalled();
  });

  it('records export again on the first tap after Clear all', async () => {
    resetActionTrailForTests();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    build().mockImplementationOnce(() => new Promise(() => {}));
    mount();
    await loadFiles(['a.png']);
    await wait(0);
    const exports = () => recentActions().filter((a) => a === 'export').length;
    await tapDownload();
    expect(exports()).toBe(1);
    const byText = (t) => Array.from(document.querySelectorAll('button')).filter((b) => b.textContent.trim() === t);
    await act(async () => { (byText('Clear all')[0] ?? byText('Clear')[0]).click(); });
    await act(async () => { byText('Clear all').at(-1).click(); });
    expect(container.querySelector(`.${styles.grid}`)).toBeNull();
    await loadFiles(['b.png']);
    await wait(0);
    await tapDownload();
    expect(exports()).toBe(2);
  });

  it('keeps the size and Share on screen while a change waits for quiet', async () => {
    const nativeShare = mockNativeFileShare();
    mount();
    await loadFiles(['a.png', 'b.png']);
    await wait(0);
    expect(downloadLink().textContent).toContain('8 B');
    await act(async () => { removeButtons()[0].click(); });
    await wait(20);
    expect(downloadLink().textContent).toContain('8 B');
    const share = container.querySelector(`.${pdfToolStyles['pdf-share-button']}`);
    expect(share).not.toBeNull();
    await act(async () => share.click());
    expect(nativeShare.share).not.toHaveBeenCalled();
    nativeShare.restore();
  });

  describe('Share through the shared download flow', () => {
    const shareButton = () => container.querySelector(`.${pdfToolStyles['pdf-share-button']}`);
    const status = () => container.querySelector('p.sr-only[role="status"]').textContent.trim();

    it('says the PDF is still ready when the share sheet is canceled, and records nothing', async () => {
      resetActionTrailForTests();
      const nativeShare = mockNativeFileShare();
      nativeShare.share.mockRejectedValueOnce(Object.assign(new Error('cancel'), { name: 'AbortError' }));
      mount();
      await loadFiles(['a.png', 'b.png']);
      await wait(0);
      await act(async () => shareButton().click());
      await wait(0);
      expect(status()).toBe('Sharing canceled. Your PDF is still ready.');
      expect(recentActions()).not.toContain('share');
      nativeShare.restore();
    });

    it('says the sheet could not open when sharing fails, and records nothing', async () => {
      resetActionTrailForTests();
      const nativeShare = mockNativeFileShare();
      nativeShare.share.mockRejectedValueOnce(new Error('boom'));
      mount();
      await loadFiles(['a.png', 'b.png']);
      await wait(0);
      await act(async () => shareButton().click());
      await wait(0);
      expect(status()).toBe('Could not open the share sheet. Please try again.');
      expect(recentActions()).not.toContain('share');
      nativeShare.restore();
    });

    it('records a completed share by the name "share"', async () => {
      resetActionTrailForTests();
      const nativeShare = mockNativeFileShare();
      mount();
      await loadFiles(['a.png', 'b.png']);
      await wait(0);
      await act(async () => shareButton().click());
      await wait(0);
      expect(recentActions()).toContain('share');
      nativeShare.restore();
    });
  });

  it('keeps the same focused anchor while a tapped build is busy', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    mount();
    await loadFiles(['a.png', 'b.png']);
    await wait(0);
    build().mockImplementationOnce(() => new Promise(() => {}));
    await act(async () => { removeButtons()[1].click(); });
    const before = downloadLink();
    await act(async () => { before.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    await wait(0);
    const busy = container.querySelector(`.${pdfToolStyles['is-processing']}`);
    expect(busy).toBe(before);
    expect(busy.tagName).toBe('A');
    expect(busy.getAttribute('aria-disabled')).toBe('true');
  });

  it('moves focus to the next tile after removing one, or the previous if it was last', async () => {
    mount();
    await loadFiles(['a.png', 'b.png', 'c.png']);
    await wait(0);
    const tiles = () => container.querySelectorAll(`.${styles.page}`);
    await act(async () => { removeButtons()[1].click(); });
    expect(document.activeElement).toBe(tiles()[1]);
    expect(tiles()[1].getAttribute('aria-label')).toContain('c.png');
    await act(async () => { removeButtons()[1].click(); });
    expect(document.activeElement).toBe(tiles()[0]);
  });

  it('ignores arrow keys with a modifier, and does not swallow them at the ends', async () => {
    mount();
    await loadFiles(['one.png', 'two.png']);
    await wait(0);
    const tiles = () => container.querySelectorAll(`.${styles.page}`);
    const fire = (el, init) => { const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }); el.dispatchEvent(e); return e; };
    let e;
    await act(async () => { e = fire(tiles()[0], { key: 'ArrowRight', shiftKey: true }); });
    expect(e.defaultPrevented).toBe(false);
    expect(tileNames()).toEqual(['one.png', 'two.png']);
    await act(async () => { e = fire(tiles()[0], { key: 'ArrowLeft' }); });
    expect(e.defaultPrevented).toBe(false);
    await act(async () => { e = fire(tiles()[0], { key: 'ArrowRight' }); });
    expect(e.defaultPrevented).toBe(true);
  });

  it('keeps focus on the moved tile through repeated keyboard moves', async () => {
    mount();
    await loadFiles(['one.png', 'two.png', 'three.png']);
    await wait(0);
    const tiles = () => container.querySelectorAll(`.${styles.page}`);
    tiles()[0].focus();
    await press(tiles()[0], 'ArrowRight');
    expect(document.activeElement).toBe(tiles()[1]);
    await press(tiles()[1], 'ArrowRight');
    expect(document.activeElement).toBe(tiles()[2]);
  });

  it('announces a repeated message again', async () => {
    mount();
    await loadFiles(['b.png', 'a.png']);
    await wait(0);
    const live = () => container.querySelector('[role="status"][aria-live="polite"]').textContent;
    const trigger = () => container.querySelector('button[aria-haspopup="listbox"]');
    const pick = async (v) => {
      await act(async () => trigger().click());
      await act(async () => { document.querySelector(`.${sortMenuStyles['sort-option']}[data-value="${v}"]`).click(); });
    };
    await pick('nameAsc');
    const first = live();
    await pick('nameDesc');
    expect(live()).not.toBe(first);
    expect(live().trim()).toBe('Images reordered.');
  });
  // LOC: /he/image-to-pdf/ passes the Hebrew catalogue; nothing the island renders stays English.
  it('renders Hebrew controls, hints and announcements from the messages prop', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      render(<PdfImageToPdfTool messages={hebrewImageToPdfMessages} shellMessages={hebrewShellMessages} />, container);
    });
    await act(async () => {
      setInputFiles(container.querySelector('input[type="file"]'), [makeImageFile('b.png'), makeImageFile('a.png'), makeImageFile('c.txt', 'text/plain')]);
    });
    await act(async () => { vi.advanceTimersByTime(1000); });
    const text = container.textContent;
    for (const word of ['הוספת תמונות', 'סדר', 'עמודים', 'הורדת PDF']) expect(text).toContain(word);
    for (const english of ['Add images', 'Order', 'pages', 'Download PDF']) expect(text).not.toContain(english);
    expect(text).toContain('דילגנו על "c.txt"');
    expect(container.querySelector('[data-page]').getAttribute('aria-label')).toBe('b.png, עמוד 1 מתוך 2. גררו, או לחצו על מקש חץ כדי להזיז.');
    expect(container.querySelector('button[aria-label="הסרת b.png"]')).not.toBeNull();
    expect(container.querySelector('#reorder-hint').textContent).toBe(hebrewImageToPdfMessages.reorderHint);
    expect(container.querySelector('[role="status"][aria-live="polite"]').textContent).toBe('2 תמונות נוספו.');
  });

  describe('Clean it up as a scan', () => {
    const scanButton = () => Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Clean it up as a scan'));

    beforeEach(() => saveHandoffMock.mockReset().mockResolvedValue(true));

    it('appears once images are added, not before', async () => {
      mount();
      expect(scanButton()).toBeUndefined();
      await loadFiles(['a.png']);
      await wait(0);
      expect(scanButton()).toBeDefined();
    });

    it('saves every image in page order as a scan-to-pdf hand-off and navigates', async () => {
      const navigate = vi.fn();
      mount({ navigate });
      await loadFiles(['a.png', 'b.jpg']);
      await wait(0);
      await act(async () => scanButton().click());
      await wait(0);
      expect(saveHandoffMock).toHaveBeenCalledTimes(1);
      const [key, record] = saveHandoffMock.mock.calls[0];
      expect(key).toBe('scan-to-pdf');
      expect(record.files.map((f) => [f.fileName, f.fileType])).toEqual([['a.png', 'image/png'], ['b.jpg', 'image/jpeg']]);
      expect(record.files[0].fileBytes.byteLength).toBeGreaterThan(0);
      expect(navigate).toHaveBeenCalledWith('/scan-to-pdf/');
    });

    it('says so and stays put when the save fails', async () => {
      saveHandoffMock.mockResolvedValue(false);
      const navigate = vi.fn();
      mount({ navigate });
      await loadFiles(['a.png']);
      await wait(0);
      await act(async () => scanButton().click());
      await wait(0);
      expect(navigate).not.toHaveBeenCalled();
      expect(container.textContent).toContain('Could not open Scan to PDF. Try again.');
    });

    it('speaks Hebrew on the Hebrew page', async () => {
      mount({ messages: hebrewImageToPdfMessages, shellMessages: hebrewShellMessages });
      await loadFiles(['a.png']);
      await wait(0);
      expect(scanButton()).toBeUndefined();
      expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent.includes(hebrewImageToPdfMessages.scanHandoff))).toBe(true);
    });
  });
});
