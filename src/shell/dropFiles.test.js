import { describe, expect, it } from 'vitest';
import { filesFromDataTransfer, filesFromPaste, sortFilesByName } from './dropFiles.js';

function fileEntry(file) {
  return { isFile: true, isDirectory: false, file: (resolve) => resolve(file) };
}

function dirEntry(children) {
  let served = false;
  return {
    isFile: false,
    isDirectory: true,
    createReader: () => ({
      readEntries: (resolve) => {
        if (served) return resolve([]);
        served = true;
        resolve(children);
      },
    }),
  };
}

const pdf = (name) => new File(['%PDF'], name, { type: 'application/pdf' });

describe('filesFromDataTransfer (MERGE-10)', () => {
  it('returns dataTransfer.files unchanged when nothing dropped is a folder', async () => {
    const files = [pdf('b.pdf'), pdf('a.pdf')];
    const dt = { files, items: files.map((f) => ({ webkitGetAsEntry: () => fileEntry(f) })) };
    expect(await filesFromDataTransfer(dt)).toEqual(files);
  });

  it('walks a dropped folder and sorts its files with the numeric collator', async () => {
    const inside = [pdf('page 10.pdf'), pdf('page 2.pdf'), pdf('Page 1.pdf')];
    const nested = dirEntry([fileEntry(pdf('z-nested 3.pdf'))]);
    const folder = dirEntry([...inside.map(fileEntry), nested]);
    const loose = pdf('cover.pdf');
    const dt = { files: [loose], items: [{ webkitGetAsEntry: () => fileEntry(loose) }, { webkitGetAsEntry: () => folder }] };
    const names = (await filesFromDataTransfer(dt)).map((f) => f.name);
    expect(names).toEqual(['cover.pdf', 'Page 1.pdf', 'page 2.pdf', 'page 10.pdf', 'z-nested 3.pdf']);
  });

  it('falls back to files where the entries API is missing', async () => {
    const files = [pdf('only.pdf')];
    expect(await filesFromDataTransfer({ files, items: [{}] })).toEqual(files);
    expect(await filesFromDataTransfer(null)).toEqual([]);
  });
});

describe('filesFromPaste', () => {
  it('reads the clipboard files and nothing else', () => {
    const files = [pdf('pasted.pdf')];
    expect(filesFromPaste({ clipboardData: { files } })).toEqual(files);
    expect(filesFromPaste({ clipboardData: { files: [] } })).toEqual([]);
    expect(filesFromPaste({})).toEqual([]);
  });
});

describe('sortFilesByName', () => {
  it('orders numerically and case-insensitively without mutating the input', () => {
    const input = [pdf('b10.pdf'), pdf('B2.pdf'), pdf('a.pdf')];
    expect(sortFilesByName(input).map((f) => f.name)).toEqual(['a.pdf', 'B2.pdf', 'b10.pdf']);
    expect(input[0].name).toBe('b10.pdf');
  });
});
