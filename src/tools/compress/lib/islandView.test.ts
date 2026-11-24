import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { ANALYSIS_SHAPES, buildAnalysisPdf, type AnalysisShape } from '../../../test/support/analysisPdfFixtures.ts';
import { englishCompressMessages, hebrewCompressMessages } from '../messages';
import { analyzePdf } from './analyzePdf.js';
import {
  analyticsStatus, arrowFor, compareCaption, finishDetail, hasFinish, needsPdfjs, needsUnlockMessages,
  resultViewFor, runStatus, showCompare, statusAttr, stripNote, stripSizes,
} from './islandView.ts';
import { metaOf } from './compressMeta.test-helper.ts';
import { formatBytes } from './resultView.ts';

const t = englishCompressMessages;

// The analysis the island holds, read by the real analyzePdf from a real pdf-lib document.
async function analysisOf(shape: AnalysisShape) {
  const bytes = await buildAnalysisPdf(ANALYSIS_SHAPES[shape]);
  return analyzePdf(await PDFDocument.load(bytes), { totalBytes: bytes.byteLength });
}

describe('the strip note', () => {
  it('the share rounds to a whole percent and floors tiny shares', () => {
    const shareOf = (imageShare: number) => stripNote('pdf', { images: [{}], imageShare }, false, t).text;
    expect(shareOf(0.004)).toBe('Most of this PDF is text. Images are less than 1% of it.');
    expect(shareOf(0.126)).toContain('13%');
    expect(shareOf(0.994)).toContain('99%');
  });

  it('a mostly-image PDF says the images are what gets smaller', async () => {
    expect(stripNote('pdf', await analysisOf('pictures'), false, t)).toEqual({ kind: 'text', text: 'Images are 90% of this PDF, the part that gets smaller.' });
  });

  it('a pure scan names its share the same way, without talking about text', async () => {
    const note = stripNote('pdf', await analysisOf('scan'), false, t);
    expect(note.text).toContain('Images are 100% of this PDF');
    expect(note.text).not.toContain('text');
  });

  it('a mostly-text PDF gets the quiet note', async () => {
    expect(stripNote('pdf', await analysisOf('mixed'), false, t)).toEqual({ kind: 'text', text: 'Most of this PDF is text. Images are 12% of it.' });
  });

  it('the pages-to-pictures switch hides the share note and unticking brings it back', async () => {
    const analysis = await analysisOf('pictures');
    expect(stripNote('pdf', analysis, true, t)).toEqual({ kind: 'none', text: '' });
    expect(stripNote('pdf', analysis, false, t).text).toContain('Images are 90% of this PDF');
  });

  it('a PDF with no images says only that there is nothing here to shrink', async () => {
    expect(stripNote('pdf', await analysisOf('textOnly'), false, t)).toEqual({ kind: 'title', text: 'Nothing here to shrink.' });
  });

  it('shows no nothing-to-shrink note when the PDF has an image', async () => {
    expect(stripNote('pdf', await analysisOf('pictures'), false, t).text).not.toContain('Nothing here to shrink.');
  });

  it('an image has no note, and a PDF not yet read has none', async () => {
    expect(stripNote('image', await analysisOf('pictures'), false, t).kind).toBe('none');
    expect(stripNote('pdf', null, false, t).kind).toBe('none');
  });
});

describe('the compare caption', () => {
  it('names page 1 only for a multi-page PDF', async () => {
    expect(compareCaption('pdf', await analysisOf('single'), t)).toBe('Drag to compare the original and the compressed page.');
    expect(compareCaption('pdf', await analysisOf('pictures'), t)).toBe('Drag to compare page 1 with the original.');
    expect(compareCaption('image', null, t)).toBe('Drag to compare the original and the compressed image.');
  });
});

describe('what the finish shows', () => {
  it('offers no Full screen button for a passthrough result', () => {
    expect(showCompare(true, true)).toBe(false);
    expect(showCompare(true, false)).toBe(true);
    expect(showCompare(false, false)).toBe(false);
  });

  it('shows Download once there are files and a build has started or failed, and not for a passthrough or no files', () => {
    expect(hasFinish(true, 'done', false)).toBe(true);
    expect(hasFinish(true, 'processing', false)).toBe(true);
    expect(hasFinish(true, 'error', false)).toBe(true);
    expect(hasFinish(true, 'idle', false)).toBe(false);
    expect(hasFinish(true, 'done', true)).toBe(false);
    expect(hasFinish(false, 'done', false)).toBe(false);
  });

  it('shows the original size in a ready Download before the first result, with no compressing look', () => {
    const file = { size: 123_456 };
    expect(finishDetail(undefined, file, null)).toBe(formatBytes(123_456));
    expect(finishDetail('9 KB', file, null)).toBe('9 KB');
    expect(finishDetail(undefined, file, 500)).toBeUndefined();
    expect(finishDetail(undefined, null, null)).toBeUndefined();
  });
});

describe('the run status', () => {
  it('is error, done, processing or idle in that order', () => {
    expect(runStatus('error', true, true)).toBe('error');
    expect(runStatus('ready', true, true)).toBe('done');
    expect(runStatus('pending', false, true)).toBe('processing');
    expect(runStatus('idle', false, false)).toBe('idle');
  });

  it('reads done only while the result on screen is the one the options ask for', () => {
    expect(statusAttr('done', true)).toBe('done');
    expect(statusAttr('done', false)).toBe('processing');
    expect(statusAttr('error', false)).toBe('error');
    expect(statusAttr('idle', false)).toBe('idle');
  });
});

describe('usage events', () => {
  it('counts neither started nor ready for the builds a pick and option changes start', () => {
    expect(analyticsStatus(false, 'processing', 'processing', 'idle', 'idle')).toBe('idle');
    expect(analyticsStatus(false, 'processing', 'done', 'idle', 'idle')).toBe('idle');
  });

  it('reports the Download tap\'s own state, processing and then done', () => {
    expect(analyticsStatus(false, 'processing', 'done', 'processing', 'idle')).toBe('processing');
    expect(analyticsStatus(false, 'processing', 'done', 'done', 'idle')).toBe('done');
  });

  it('counts a failed build, then started and ready for the Try again tap', () => {
    expect(analyticsStatus(false, 'processing', 'error', 'idle', 'idle')).toBe('error');
    expect(analyticsStatus(false, 'processing', 'error', 'processing', 'processing')).toBe('error');
    expect(analyticsStatus(false, 'processing', 'processing', 'idle', 'processing')).toBe('processing');
    expect(analyticsStatus(false, 'processing', 'done', 'idle', 'done')).toBe('done');
  });

  it('counts the Download tap, not the compression a pick starts, for a set of photos', () => {
    expect(analyticsStatus(true, 'processing', 'idle', 'idle', 'done')).toBe('idle');
    expect(analyticsStatus(true, 'error', 'done', 'idle', 'idle')).toBe('error');
    expect(analyticsStatus(true, 'done', 'done', 'done', 'idle')).toBe('done');
  });
});

describe('the strip sizes', () => {
  const batch = { active: false, strip: { before: 9, compressedSize: 4, showResult: true, savingsPercent: 55 } };

  it('puts the before to after sizes and the percent-smaller tag in the shell strip', () => {
    expect(stripSizes(batch, { size: 1000 }, true, false, 400, 60)).toEqual({ before: 1000, showResult: true, compressedSize: 400, savingsPercent: 60 });
    expect(stripSizes(batch, { size: 1000 }, true, true, 1000, 0)?.showResult).toBe(false);
    expect(stripSizes(batch, { size: 1000 }, false, false, 400, 60)?.showResult).toBe(false);
  });

  it('has none without a file, and the set\'s own sizes for a set of photos', () => {
    expect(stripSizes(batch, null, false, false, null, 0)).toBeNull();
    expect(stripSizes({ ...batch, active: true }, null, false, false, null, 0)).toBe(batch.strip);
  });

  it('points the arrow left in right-to-left text', () => {
    expect(arrowFor(hebrewCompressMessages.dir)).toBe('←');
    expect(arrowFor(englishCompressMessages.dir)).toBe('→');
  });
});

describe('the old browser notice', () => {
  it('stays off a photo and a set, which never load pdf.js', () => {
    expect(needsPdfjs(true, false)).toBe(false);
    expect(needsPdfjs(false, true)).toBe(false);
  });

  it('still names the version for a PDF', () => {
    expect(needsPdfjs(false, false)).toBe(true);
  });
});

describe('the password state messages', () => {
  it('shows the Hebrew title with the Hebrew messages', () => {
    const messages = needsUnlockMessages(hebrewCompressMessages);
    expect(messages.title).toBe(hebrewCompressMessages.protectedNeedsPasswordTitle);
    expect(messages).toEqual({
      title: hebrewCompressMessages.protectedNeedsPasswordTitle,
      body: hebrewCompressMessages.protectedNeedsPasswordBody,
      unlockIt: hebrewCompressMessages.protectedUnlockIt,
      handoffFailed: hebrewCompressMessages.protectedHandoffFailed,
    });
    expect(messages.title).not.toBe(englishCompressMessages.protectedNeedsPasswordTitle);
  });
});

describe('the result view from a run', () => {
  const settings = { t, file: new File([new Uint8Array(1000)], 'a.pdf', { type: 'application/pdf' }), kind: 'pdf' as const, level: 'medium', targetKB: 100, flatten: true };

  it('shows no download detail before the first run has landed', () => {
    expect(resultViewFor(settings, { isDone: false, compressedSize: null, meta: null }).downloadDetail).toBeUndefined();
  });

  it('takes the passthrough, unchanged and raster size from the run\'s meta', () => {
    const view = resultViewFor(settings, { isDone: true, compressedSize: 1000, meta: metaOf({ passthrough: true, unchanged: true, rasterBytes: 5000 }) });
    expect(view.resultTitle).toBe(t.alreadySmallTitle);
    expect(view.resultNotice).toContain(formatBytes(5000));
  });
});
