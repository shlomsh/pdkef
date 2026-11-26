import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildImagesPdf, reportBuildError, skippedNames } from './buildImagesPdf.ts';
import { imagesToPdf, UnreadableImageError } from '#lib/images/imagesToPdf.js';
import { reportError } from '#lib/telemetry/errorReport.ts';

// The counting test runs the real imagesToPdf: cut.png is bytes neither pdf-lib nor a browser decoder (absent here) can
// read, so it is really skipped. The second test is the one forced call (marked where it is).
vi.mock('#lib/images/imagesToPdf.js', { spy: true });
vi.mock('#lib/telemetry/errorReport.ts', { spy: true });

// A real, valid 1x1 transparent PNG (67 bytes).
const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const png = () => Uint8Array.from(atob(PNG_1X1_BASE64), (c) => c.charCodeAt(0));
const files = ['a.png', 'cut.png', 'c.png'].map((name) => new File([name === 'cut.png' ? png().slice(0, 40) : png()], name, { type: 'image/png' }));

describe('buildImagesPdf (DEBT-75)', () => {
  beforeEach(() => { vi.mocked(imagesToPdf).mockReset(); vi.mocked(reportError).mockClear(); });

  it('counts the pages kept and names the pictures left out', async () => {
    const onUnreadable = vi.fn();
    const built = await buildImagesPdf(files, () => {}, new AbortController().signal, onUnreadable);
    expect(built.pageCount).toBe(2);
    expect(onUnreadable).toHaveBeenCalledWith(['cut.png']);
  });

  it('names nothing for a build that was replaced meanwhile', async () => {
    const controller = new AbortController();
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: buildImagesPdf's own guard needs an abort after the last picture, but the real imagesToPdf throws at its end, so only an abort inside pdf.save() reaches it, which a test cannot time.
    vi.mocked(imagesToPdf).mockImplementation(async (_files, _progress, _signal, options) => {
      options?.onSkip?.('cut.png');
      controller.abort();
      return new Blob(['pdf']);
    });
    const onUnreadable = vi.fn();
    await buildImagesPdf(files, () => {}, controller.signal, onUnreadable);
    expect(onUnreadable).not.toHaveBeenCalled();
  });
});

describe('reportBuildError', () => {
  beforeEach(() => { vi.mocked(reportError).mockClear(); });

  it('reports a failure of ours', () => {
    const err = new Error('boom');
    reportBuildError(err);
    expect(reportError).toHaveBeenCalledWith('pdf_tool_run', err, 'build_pdf_from_images');
  });

  it('reports nothing for a picture neither decoder can read', () => {
    reportBuildError(new UnreadableImageError('cut.png'));
    expect(reportError).not.toHaveBeenCalled();
  });
});

describe('skippedNames', () => {
  const entries = [{ file: { name: 'a.png' } }, { file: { name: 'cut.png' } }];

  it('lists refused files first, then left-out pictures still in the list', () => {
    expect(skippedNames(['doc.gif'], ['cut.png', 'gone.png'], entries)).toEqual(['doc.gif', 'cut.png']);
  });
});
