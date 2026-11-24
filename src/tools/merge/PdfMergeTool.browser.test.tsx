import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PdfMergeTool from './PdfMergeTool.tsx';
import { mergePdfs } from './lib/merge.js';
import { pagesPdf } from '../../test/support/mergeFixtures.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { installBrowserToolHarness, type BrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import type { QuietPolicy } from '#lib/output/quietPrepare.ts';
import ownerOnlyUrl from '../../lib/__fixtures__/encrypted/owner-only.pdf?url';
import needsPasswordUrl from '../../lib/__fixtures__/encrypted/needs-password.pdf?url';

// The two Merge flows only Chromium shows: real thumbnails (pdf.js and the real IntersectionObserver) filling
// the grid, and the real pdf.js lock probe on a protected file. Everything else about the tool is tested on the
// hook, component or lib that owns it.

answerNetwork();

vi.mock('./lib/merge.js', { spy: true });

// Tests that are not about timing build 5ms after the last change instead of 1.5s.
const FAST_QUIET: QuietPolicy = { baseMs: 5, stepMs: 0, maxMs: 5, burstWindowMs: 1 };
const fetched = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());

describe('PdfMergeTool in Chromium', () => {
  let container: HTMLDivElement | null = null;
  let harness: BrowserToolHarness;

  beforeEach(async () => {
    harness = await installBrowserToolHarness();
  });

  afterEach(async () => {
    if (container) act(() => render(null, container as HTMLDivElement));
    container?.remove();
    container = null;
    vi.mocked(mergePdfs).mockClear();
    await harness.restore();
  });

  function mount() {
    const host = document.createElement('div');
    container = host;
    document.body.appendChild(host);
    act(() => render(<PdfMergeTool quietPolicy={FAST_QUIET} />, host));
  }
  const dom = () => container as HTMLDivElement;
  const fileNames = () => Array.from(dom().querySelectorAll('ul[aria-describedby="reorder-hint"] > li [data-file-name]')).map((el) => el.textContent);
  const heading = () => dom().querySelector('#page-grid-heading');
  const downloadLink = () => dom().querySelector('a[data-state][href]');
  async function loadFiles(files: File[]) {
    await act(async () => { setInputFiles(dom().querySelector('input[type="file"]'), files); });
  }

  it('real thumbnails fill the grid: "N rendered" goes away once every cell has one, and a late thumbnail does not restart the pre-merge', async () => {
    mount();
    await loadFiles([await pagesPdf([100, 100], 'a.pdf'), await pagesPdf([110, 110], 'b.pdf')]);
    // The grid arrives through a dynamic import(); it names the total of four pages (two files, two pages each).
    await waitUntil(() => expect(heading()?.textContent).toContain('4 pages'));
    await waitUntil(() => expect(downloadLink()).not.toBeNull());
    const href = downloadLink()?.getAttribute('href');
    expect(mergePdfs).toHaveBeenCalledOnce();
    await waitUntil(() => expect(heading()?.textContent).not.toContain('rendered'));
    expect(heading()?.textContent).toContain('4 pages');
    // The thumbnails arrived after the pre-merge started, and did not restart it.
    await waitUntil(() => expect(dom().querySelectorAll('ul[data-page-grid] > li[data-key] img').length).toBe(4));
    expect(mergePdfs).toHaveBeenCalledOnce();
    expect(downloadLink()?.getAttribute('href')).toBe(href);
    expect(harness.createdBlobs()).toHaveLength(1);
  });

  it.each([
    ['owner-only.pdf', 'owner-restricted', ownerOnlyUrl],
    ['needs-password.pdf', 'needs-password', needsPasswordUrl],
  ])('a single protected file (%s) shows the locked state in place of the result area', async (fixture, kind, url) => {
    mount();
    await loadFiles([new File([await fetched(url) as BlobPart], fixture, { type: 'application/pdf' })]);
    await waitUntil(() => expect(dom().querySelector('[data-needs-unlock]')).not.toBeNull());

    expect(dom().querySelector('[data-needs-unlock]')?.getAttribute('data-needs-unlock')).toBe(kind);
    expect(dom().textContent).not.toContain("That didn't work");
    expect(dom().textContent).not.toContain('0 pages');
    expect(dom().querySelector('[role="alert"]')).toBeNull();
    expect(dom().querySelector('[aria-label="Undo last change"]')).toBeNull();
    expect(fileNames()).toEqual([fixture]);
    expect(Array.from(dom().querySelectorAll('button')).some((b) => b.textContent?.includes('Add files'))).toBe(true);
  });
});
