// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import StripSizes from './StripSizes.tsx';
import { arrowFor, resultViewFor } from '../lib/islandView.ts';
import { formatBytes } from '../lib/resultView.ts';
import { metaOf } from '../lib/compressMeta.test-helper.ts';
import { englishCompressMessages, hebrewCompressMessages, type CompressMessages } from '../messages';

const file = new File([new Uint8Array(400_000)], 'shell.pdf', { type: 'application/pdf' });

let host: HTMLElement | null = null;
afterEach(() => {
  if (host) {
    act(() => render(null, host!));
    host.remove();
    host = null;
  }
});

function mountSizes(t: CompressMessages, compressedSize: number | null, showResult: boolean) {
  const { savingsPercent } = resultViewFor(
    { t, file, kind: 'pdf', level: 'medium', targetKB: 100, flatten: false },
    { isDone: showResult, compressedSize, meta: metaOf() },
  );
  host = document.createElement('div');
  document.body.appendChild(host);
  const arrow = arrowFor(t.dir);
  act(() => render(<StripSizes t={t} before={file.size} arrow={arrow} showResult={showResult} compressedSize={compressedSize} savingsPercent={savingsPercent} />, host!));
  return { savingsPercent };
}
const sizes = () => host!.querySelector('[data-compress-sizes]')!.textContent!;

describe('StripSizes', () => {
  it('puts the before to after sizes and the percent-smaller tag in the strip', () => {
    const { savingsPercent } = mountSizes(englishCompressMessages, 100_000, true);
    expect(savingsPercent).toBe(75);
    expect(sizes()).toContain(formatBytes(file.size));
    expect(sizes()).toContain('→');
    expect(sizes()).toContain(formatBytes(100_000));
    expect(sizes()).toContain(`${savingsPercent}% smaller`);
  });

  it('points the sizes arrow left in right-to-left text', () => {
    mountSizes(hebrewCompressMessages, 100_000, true);
    expect(sizes()).toContain('←');
    expect(sizes()).not.toContain('→');
  });

  it('shows only the original before a result', () => {
    mountSizes(hebrewCompressMessages, null, false);
    expect(sizes()).toBe(formatBytes(file.size));
  });

  it('shows the last result as the original alone with no tag while a result is not on screen', () => {
    mountSizes(englishCompressMessages, 100_000, false);
    expect(sizes()).toBe(formatBytes(file.size));
  });
});
