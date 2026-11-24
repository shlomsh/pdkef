// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import ResultNotes, { hasResultNotes } from './ResultNotes.tsx';
import { resultViewFor } from '../lib/islandView.ts';
import { metaOf } from '../lib/compressMeta.test-helper.ts';
import type { CompressMeta } from '../lib/compressCallbacks.ts';
import { englishCompressMessages } from '../messages';

const t = englishCompressMessages;
const pdf = new File([new Uint8Array(400_000)], 'doc.pdf', { type: 'application/pdf' });
const photo = new File([new Uint8Array(90_000)], 'photo.jpg', { type: 'image/jpeg' });

type ViewInput = Partial<{ file: File; kind: 'pdf' | 'image'; level: string; targetKB: number; flatten: boolean; isDone: boolean; compressedSize: number | null }> & Partial<CompressMeta>;
const viewOf = (over: ViewInput) => {
  const { file = pdf, kind = 'pdf', level = 'medium', targetKB = 100, flatten = false, isDone = true, compressedSize = 100_000, ...metaOver } = over;
  return resultViewFor({ t, file, kind, level, targetKB, flatten }, { isDone, compressedSize, meta: metaOf(metaOver) });
};

let host: HTMLElement | null = null;
afterEach(() => {
  if (host) {
    act(() => render(null, host!));
    host.remove();
    host = null;
  }
});
function mountNotes(over: Partial<ViewInput>) {
  const view = viewOf(over);
  const isDone = over.isDone ?? true;
  const passthrough = over.passthrough ?? false;
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<ResultNotes view={view} isDone={isDone} passthrough={passthrough} />, host!));
  return { view, isDone, passthrough };
}
const notes = () => host!.querySelector('[data-result-notes]');

describe('ResultNotes', () => {
  it('says an image result is a JPEG, beside Download', () => {
    const input = { file: photo, kind: 'image' as const, level: 'target', compressedSize: 30_000, imageReason: null };
    const shown = mountNotes(input);
    expect(hasResultNotes(shown)).toBe(true);
    expect(notes()!.textContent).toContain('once compressed, the output is a JPEG');
    expect(notes()!.textContent).not.toContain('so the file is untouched');
  });

  it('a smaller result with a big saving has no notice', () => {
    const shown = mountNotes({ imageReason: 'smaller' });
    expect(hasResultNotes(shown)).toBe(false);
    expect(notes()).toBeNull();
    expect(host!.querySelector('[data-compress-warning]')).toBeNull();
  });

  it.each([
    ['an image already under the target', { file: photo, kind: 'image' as const, passthrough: true, level: 'target', compressedSize: photo.size }],
    ['a PDF under an Exact size target', { passthrough: true, level: 'target', flatten: true, compressedSize: pdf.size }],
    ['a PDF handed back as already as small as it gets', { passthrough: true, unchanged: true, flatten: true, rasterBytes: 900_000, compressedSize: pdf.size }],
    ['an Exact size the input could not reach', { passthrough: true, unchanged: true, flatten: true, level: 'target', metTarget: false, rasterBytes: 900_000, compressedSize: pdf.size }],
    ['reason no-images', { passthrough: true, unchanged: true, imageReason: 'no-images', compressedSize: pdf.size }],
    ['reason no-gain', { passthrough: true, unchanged: true, imageReason: 'no-gain', compressedSize: pdf.size }],
    ['reason encrypted', { passthrough: true, unchanged: true, imageReason: 'encrypted', compressedSize: pdf.size }],
    ['reason unsupported', { passthrough: true, unchanged: true, imageReason: 'unsupported', compressedSize: pdf.size }],
    ['reason under-target', { passthrough: true, imageReason: 'under-target', level: 'target', compressedSize: pdf.size }],
  ])('keeps the note in the result column for %s, so nothing renders here', (_name, input) => {
    const shown = mountNotes(input);
    expect(hasResultNotes(shown)).toBe(false);
    expect(notes()).toBeNull();
  });

  it('shows the closest-achievable warning when Exact size missed', () => {
    const shown = mountNotes({ level: 'target', metTarget: false, compressedSize: 250_000, flatten: true });
    expect(hasResultNotes(shown)).toBe(true);
    expect(host!.querySelector('[data-compress-warning]')!.textContent).toContain('Closest achievable');
  });

  it('a target missed on the image path names both sizes and drops "Closest achievable"', () => {
    mountNotes({ level: 'target', targetKB: 100, metTarget: false, imageReason: 'smaller', compressedSize: 250_000 });
    const text = notes()!.textContent!;
    expect(text).toContain('250 KB');
    expect(text).toContain('100 KB');
    expect(text).not.toContain('Closest achievable');
  });
});
