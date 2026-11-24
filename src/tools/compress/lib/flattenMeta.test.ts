import { describe, expect, it } from 'vitest';
import { englishCompressMessages as t } from '../messages';
import { flattenMeta } from './flattenMeta.ts';
import { resultViewFor } from './islandView.ts';
import { formatBytes } from './resultView.ts';

const input = new File([new Uint8Array(1000)], 'small_form.pdf', { type: 'application/pdf' });
const reEncoded = new Blob([new Uint8Array(400)], { type: 'application/pdf' });

// What the island derives from a finished flatten run, from the build's own meta.
function viewOf(blob: Blob, level: string, metTarget: boolean, rasterBytes: number | null) {
  const meta = flattenMeta({ activeFile: input, blob, level, metTarget, rasterBytes, t });
  const view = resultViewFor(
    { t, file: input, kind: 'pdf', level, targetKB: 100, flatten: true },
    { isDone: true, compressedSize: blob.size, meta },
  );
  return { meta, view };
}

describe('flattenMeta', () => {
  it('describes a re-encoded copy as neither passthrough nor unchanged', () => {
    const { meta } = viewOf(reEncoded, 'medium', true, 400);
    expect(meta).toMatchObject({ filename: 'small_form-compressed.pdf', passthrough: false, unchanged: false, announcement: t.complete, rasterBytes: 400 });
  });

  it('renders passthroughNotice, not rasterizeNotice, for a target-mode passthrough on the pages-to-pictures path', () => {
    const { meta, view } = viewOf(input, 'target', true, 5000);
    expect(meta).toMatchObject({ passthrough: true, unchanged: false, announcement: t.complete });
    expect(view.resultNotice).toBe(t.passthroughNotice);
    expect(view.resultNotice).not.toBe(t.rasterizeNotice);
    expect(view.resultTitle).toBe(t.underTargetTitle);
  });

  it('says a PDF is already as small as it gets, instead of a success, when a level hands the input back', () => {
    const { meta, view } = viewOf(input, 'medium', true, 5000);
    expect(meta).toMatchObject({ passthrough: true, unchanged: true, announcement: t.alreadySmallComplete });
    expect(view.resultTitle).toBe(t.alreadySmallTitle);
    expect(view.resultNotice).toContain(`Turned into images, this PDF came to ${formatBytes(5000)}, more than the ${formatBytes(1000)} it is now`);
    expect(view.resultNotice).not.toBe(t.rasterizeNotice);
  });

  it('says the target cannot be reached this way, with the real numbers, when Exact size hands the input back', () => {
    const { meta, view } = viewOf(input, 'target', false, 5000);
    expect(meta).toMatchObject({ passthrough: true, unchanged: true, metTarget: false });
    expect(view.resultNotice).toContain(formatBytes(5000));
    expect(view.resultNotice).toContain('100 KB can');
    expect(view.resultNotice).toContain("can't be reached this way");
    expect(view.closestWarning).toBeNull();
  });
});
