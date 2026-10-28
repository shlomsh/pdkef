import { describe, expect, it } from 'vitest';
import { sortByDate, sortByName } from './sort.js';

const entry = (name, lastModified = 0, pdfCreationDate) => ({ file: { name, lastModified }, pdfCreationDate });
const names = (entries) => entries.map((e) => e.file.name);

describe('sortByName', () => {
  it('sorts numerically and ignoring case', () => {
    const sorted = sortByName([entry('file10.pdf'), entry('File2.pdf'), entry('file1.pdf')]);
    expect(names(sorted)).toEqual(['file1.pdf', 'File2.pdf', 'file10.pdf']);
  });

  it('reverses for desc and does not mutate the input', () => {
    const input = [entry('a.pdf'), entry('b.pdf')];
    expect(names(sortByName(input, 'desc'))).toEqual(['b.pdf', 'a.pdf']);
    expect(names(input)).toEqual(['a.pdf', 'b.pdf']);
  });

  it('handles an empty list', () => {
    expect(sortByName([])).toEqual([]);
  });
});

describe('sortByDate', () => {
  it('falls back to lastModified', () => {
    const sorted = sortByDate([entry('b.pdf', 200), entry('a.pdf', 100)]);
    expect(names(sorted)).toEqual(['a.pdf', 'b.pdf']);
  });

  it('prefers the PDF creation date over lastModified', () => {
    const sorted = sortByDate([entry('a.pdf', 100, 900), entry('b.pdf', 500, 300)]);
    expect(names(sorted)).toEqual(['b.pdf', 'a.pdf']);
  });

  it('prefers a date in the file name over everything', () => {
    const sorted = sortByDate([
      entry('x 2024-03-01.pdf', 9e12, 9e12),
      entry('y 2023_05_09.pdf', 0, 0),
      entry('z.pdf', Date.UTC(2023, 11, 1)),
    ]);
    expect(names(sorted)).toEqual(['y 2023_05_09.pdf', 'z.pdf', 'x 2024-03-01.pdf']);
  });

  it('reverses for desc', () => {
    expect(names(sortByDate([entry('a.pdf', 1), entry('b.pdf', 2)], 'desc'))).toEqual(['b.pdf', 'a.pdf']);
  });
});
