import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildImagesPdf, reportBuildError, skippedNames } from './buildImagesPdf.ts';
import { imagesToPdf, UnreadableImageError } from '#lib/images/imagesToPdf.js';
import { reportError } from '#lib/telemetry/errorReport.ts';

vi.mock('#lib/images/imagesToPdf.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/images/imagesToPdf.js')>()),
  imagesToPdf: vi.fn(),
}));
vi.mock('#lib/telemetry/errorReport.ts', () => ({ reportError: vi.fn() }));

const files = ['a.png', 'cut.png', 'c.png'].map((name) => new File([new Uint8Array(1)], name, { type: 'image/png' }));

describe('buildImagesPdf (DEBT-75)', () => {
  beforeEach(() => { vi.mocked(imagesToPdf).mockReset(); vi.mocked(reportError).mockReset(); });

  it('counts the pages kept and names the pictures left out', async () => {
    vi.mocked(imagesToPdf).mockImplementation(async (_files, _progress, _signal, options) => {
      options?.onSkip?.('cut.png');
      return new Blob(['pdf']);
    });
    const onUnreadable = vi.fn();
    const built = await buildImagesPdf(files, () => {}, new AbortController().signal, onUnreadable);
    expect(built.pageCount).toBe(2);
    expect(onUnreadable).toHaveBeenCalledWith(['cut.png']);
  });

  it('names nothing for a build that was replaced meanwhile', async () => {
    const controller = new AbortController();
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
  beforeEach(() => { vi.mocked(reportError).mockReset(); });

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
