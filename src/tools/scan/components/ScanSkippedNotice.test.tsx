import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import ScanSkippedNotice, { addSkipped, type SkippedFile } from './ScanSkippedNotice.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});
function text(files: SkippedFile[]) {
  container = document.createElement('div');
  act(() => render(<ScanSkippedNotice names={files} />, container!));
  return container.textContent ?? '';
}

describe('ScanSkippedNotice', () => {
  it('says a PDF could not be opened, not that only photos can be scanned', () => {
    const shown = text([{ name: 'a.pdf', reason: 'pdf' }]);
    expect(shown).toContain('a.pdf could not be opened');
    expect(shown).not.toContain('only JPG and PNG');
  });

  it('names every PDF that could not be opened', () => {
    const shown = text([{ name: 'a.pdf', reason: 'pdf' }, { name: 'b.pdf', reason: 'pdf' }]);
    expect(shown).toContain('a.pdf');
    expect(shown).toContain('b.pdf');
    expect(shown).not.toContain('only JPG and PNG');
  });

  it('keeps the type reason and the PDF reason apart', () => {
    const shown = text([{ name: 'c.heic', reason: 'type' }, { name: 'a.pdf', reason: 'pdf' }]);
    expect(shown).toContain('c.heic was skipped: only JPG and PNG');
    expect(shown).toContain('a.pdf could not be opened');
  });
});

describe('addSkipped', () => {
  it('appends without duplicates', () => {
    const a: SkippedFile = { name: 'a.pdf', reason: 'pdf' };
    const b: SkippedFile = { name: 'b.pdf', reason: 'pdf' };
    expect(addSkipped(addSkipped([a], [b]), [a])).toEqual([a, b]);
  });
});
