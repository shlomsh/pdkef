// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import IntakeNotes from './IntakeNotes.tsx';
import { englishCompressMessages, hebrewCompressMessages, type CompressMessages } from '../messages';

let host: HTMLElement | null = null;
afterEach(() => {
  if (host) {
    act(() => render(null, host!));
    host.remove();
    host = null;
  }
});

function mountNotes(t: CompressMessages, rejected: string[], leftOutPdfs: string[] = []) {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<IntakeNotes t={t} rejected={rejected} leftOutPdfs={leftOutPdfs} />, host!));
  return host.querySelector('[role="status"]')!.textContent!;
}

describe('IntakeNotes', () => {
  it('isolates a skipped file name inside the Hebrew sentence, and only in Hebrew', () => {
    expect(mountNotes(hebrewCompressMessages, ['2025-notes.txt'])).toContain('⁨2025-notes.txt⁩');
    act(() => render(null, host!));
    host!.remove();
    const english = mountNotes(englishCompressMessages, ['2025-notes.txt']);
    expect(english).toContain('2025-notes.txt');
    expect(english).not.toContain('⁨');
  });

  it('counts several skipped files instead of naming them', () => {
    expect(mountNotes(englishCompressMessages, ['a.txt', 'b.txt'])).toContain('Skipped 2 files');
  });

  it('names a PDF left out among photos, isolated in Hebrew only', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<IntakeNotes t={hebrewCompressMessages} rejected={[]} leftOutPdfs={['scan.pdf']} />, host!));
    expect(host.querySelector('[data-batch-left-out]')!.textContent).toContain('⁨scan.pdf⁩');
  });
});
