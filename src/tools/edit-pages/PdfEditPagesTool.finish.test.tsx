import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import { mockNativeFileShare } from '../../test/support/mockFileShare.js';
import { HeldFile } from '../../test/support/heldFile.ts';
import { hideEncryption } from '../../test/support/hideEncryption.ts';
import { healthy, ORIGINAL_WIDTHS } from '../../test/support/pdfPageTreeFixtures.ts';
import { editPages } from './lib/editPages.js';
import { encryptedFixture, pagesOf, pdf, useEditPagesTool, waitUntil } from './components/editPagesTool.test-helper.tsx';

vi.mock('./lib/editPages.js', { spy: true });

describe('PdfEditPagesTool finish', () => {
  const s = useEditPagesTool();

  let installedShare: ReturnType<typeof mockNativeFileShare> | undefined;
  afterEach(() => {
    installedShare?.restore();
    installedShare = undefined;
    vi.restoreAllMocks();
  });

  const finishButton = (label: string) => Array.from(s.container.querySelectorAll('[data-count] button'))
    .find((button) => button.textContent?.includes(label));
  const withMark = (mark: string) => {
    const tail = new TextEncoder().encode(`%${mark}`);
    const bytes = new Uint8Array(healthy().length + tail.length);
    bytes.set(healthy());
    bytes.set(tail, healthy().length);
    return pdf('same.pdf', bytes, 1000);
  };

  it('a failed build points to Unlock, where a protected PDF can be opened', async () => {
    // The check reads this file as open, so the build itself meets its protection.
    const locked = new Uint8Array(await encryptedFixture('owner-only').arrayBuffer());
    await s.load(pdf('owner-only.pdf', hideEncryption(locked)));
    await s.click(s.skipButton(2));
    await s.prepareNow();
    await s.harness.flush();

    expect(s.container.querySelector('[role="alert"] a[href="/unlock/"]')).not.toBeNull();
    expect(s.downloadElement().dataset.state).toBe('error');
    expect(s.harness.reports()).toMatchObject([{ area: 'pdf_tool_run', step: 'apply_page_edits', type: 'Error' }]);
  });

  it('builds the edited PDF from the plan and offers it as a download under the output name', async () => {
    await s.load();
    await s.click(s.skipButton(2));
    await s.prepareNow();

    expect(s.harness.createdBlobs()).toHaveLength(1);
    expect(await pagesOf(s.shownOutput())).toEqual({
      count: 2, widths: [ORIGINAL_WIDTHS[0], ORIGINAL_WIDTHS[2]], rotations: [0, 0], fonts: [false, false],
    });
    const link = s.downloadElement();
    expect(link.dataset.state).toBe('ready');
    expect(link.getAttribute('download')).toBe('document_modified.pdf');
    expect(link.textContent).toContain('Download edited PDF');
  });

  it('Add page numbers is part of the build, and turning it off builds again without them', async () => {
    await s.load();
    await s.click(s.container.querySelector<HTMLInputElement>('input[type="checkbox"]'));
    await s.prepareNow();
    expect(await pagesOf(s.shownOutput())).toMatchObject({ count: 3, widths: ORIGINAL_WIDTHS, fonts: [true, true, true] });

    await s.click(s.container.querySelector<HTMLInputElement>('input[type="checkbox"]'));
    await s.prepareNow();
    expect(await pagesOf(s.shownOutput())).toMatchObject({ count: 3, widths: ORIGINAL_WIDTHS, fonts: [false, false, false] });
    expect(s.harness.createdBlobs()).toHaveLength(2);
  });

  it('a tap on a ready Download opens the done strip with Share and the hand-offs', async () => {
    installedShare = mockNativeFileShare();
    await s.load();
    await s.prepareNow();
    expect(s.downloadElement().dataset.state).toBe('ready');

    const quiet = s.container.querySelector<HTMLAnchorElement>('[data-quiet-download]');
    quiet?.addEventListener('click', (event) => event.preventDefault());
    await s.click(quiet);
    expect(s.downloadElement().dataset.state).toBe('saved');
    const strip = s.container.querySelector('section[aria-label="Your edited PDF is ready."]');
    expect(strip).not.toBeNull();
    expect(strip?.textContent).toContain('document_modified.pdf');
    expect(strip?.textContent).toContain('3 pages');
    expect(strip?.textContent).toContain('Compress');
    expect(strip?.textContent).toContain('Sign');

    const share = finishButton('Share');
    expect(share).not.toBeUndefined();
    await s.click(share as HTMLElement);
    await waitUntil(() => expect(installedShare?.share).toHaveBeenCalledTimes(1));
    const [shared] = installedShare?.share.mock.calls[0] as unknown as [ShareData];
    expect(shared.files?.[0]?.name).toBe('document_modified.pdf');

    const stripCompress = Array.from(strip?.querySelectorAll('button') ?? []).find((button) => button.textContent?.includes('Compress'));
    expect(stripCompress).not.toBeUndefined();
    await s.click(stripCompress as HTMLElement);
    await s.harness.settle();
    expect((await s.harness.takeHandoff('compress'))?.fileName).toBe('document_modified.pdf');
  });

  it('the rail hands the result to Compress and parks its bytes', async () => {
    await s.load();
    await s.prepareNow();
    await s.click(finishButton('Compress') as HTMLElement);
    await s.harness.settle();

    const handoff = await s.harness.takeHandoff('compress');
    expect(handoff).toMatchObject({ fileName: 'document_modified.pdf', fileType: 'application/pdf', from: 'edit-pdf' });
    expect(await pagesOf(new Blob([handoff?.fileBytes ?? new ArrayBuffer(0)]))).toMatchObject({ count: 3, widths: ORIGINAL_WIDTHS });
  });

  it('replacing the file drops a Download tapped before the build landed', async () => {
    const first = new HeldFile(healthy() as Uint8Array<ArrayBuffer>, 'a.pdf', { held: false });
    await s.load(first);
    const runsBefore = vi.mocked(editPages).mock.results.length;
    first.hold();
    await s.press();
    await first.started;
    await s.click(s.downloadElement());
    expect(s.downloadElement().dataset.state).toBe('preparing');

    await s.replaceWith(pdf('b.pdf'));
    await s.prepareNow();
    expect(s.downloadElement().dataset.state).toBe('ready');
    first.release();
    await Promise.allSettled([vi.mocked(editPages).mock.results[runsBefore].value]);
    await s.drain();
    expect(s.downloadElement().dataset.state).toBe('ready');
    expect(s.downloadElement().getAttribute('download')).toBe('b_modified.pdf');
  });

  it('renaming the output keeps the built PDF: no rebuild, still ready', async () => {
    await s.load();
    await s.prepareNow();
    expect(s.harness.createdBlobs()).toHaveLength(1);
    const builtHref = s.downloadElement().getAttribute('href');
    const name = s.container.querySelector('[contenteditable]') as HTMLElement;
    await act(async () => { name.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    await act(async () => { name.textContent = 'my edit'; });
    await act(async () => { name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    await waitUntil(() => expect(s.downloadElement().getAttribute('download')).toBe('my edit.pdf'));
    expect(s.downloadElement().getAttribute('href')).toBe(builtHref);
    expect(s.downloadElement().dataset.state).toBe('ready');
    expect(s.harness.createdBlobs()).toHaveLength(1);
  });

  it('a different file with the same name, size and date is built, not served from the cache', async () => {
    await s.load(withMark('a'));
    await s.prepareNow();
    expect(s.harness.createdBlobs()).toHaveLength(1);

    await s.replaceWith(withMark('b'));
    await s.prepareNow();
    const [firstBuild, secondBuild] = s.harness.createdBlobs();
    expect(s.harness.createdBlobs()).toHaveLength(2);
    expect(secondBuild).not.toBe(firstBuild);
  });

  it('the signal of a superseded build is aborted and handed to editPages', async () => {
    const { PDFDocument } = await getPdfLib();
    const saves = vi.spyOn(PDFDocument.prototype, 'save');
    const source = new HeldFile(healthy() as Uint8Array<ArrayBuffer>, 'a.pdf', { held: false });
    await s.load(source);
    const before = vi.mocked(editPages).mock.calls.length;
    source.hold();
    await s.press();
    await source.started;
    await s.click(s.skipButton(2));
    await s.press();
    source.release();
    await waitUntil(() => expect(s.downloadElement().getAttribute('href')).not.toBeNull());
    const runs = vi.mocked(editPages).mock.results.slice(before).map((run) => run.value as Promise<Blob>);
    expect(runs).toHaveLength(2);
    await Promise.allSettled(runs);
    await s.drain();
    expect(saves).toHaveBeenCalledTimes(1);
    expect(await pagesOf(s.shownOutput())).toMatchObject({ count: 2 });
  });
});
