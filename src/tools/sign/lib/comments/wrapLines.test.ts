import { describe, expect, it } from 'vitest';
import { wrapLines } from './wrapLines.ts';

// One unit per character keeps the arithmetic obvious.
const measure = (text: string) => Array.from(text).length;

describe('wrapLines', () => {
  it('breaks at spaces so no line is wider than the limit', () => {
    expect(wrapLines('aaa bbb ccc ddd', 7, measure)).toEqual(['aaa bbb', 'ccc ddd']);
  });

  it('keeps a text that fits as one line', () => {
    expect(wrapLines('short note', 40, measure)).toEqual(['short note']);
  });

  it('keeps explicit newlines, including a blank line between paragraphs', () => {
    expect(wrapLines('one\n\ntwo', 40, measure)).toEqual(['one', '', 'two']);
    expect(wrapLines('one\r\ntwo', 40, measure)).toEqual(['one', 'two']);
  });

  it('hard-breaks a word longer than the limit', () => {
    expect(wrapLines('abcdefghij', 4, measure)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('starts the next line after a hard-broken word with its remainder', () => {
    expect(wrapLines('x abcdefghij y', 4, measure)).toEqual(['x', 'abcd', 'efgh', 'ij y']);
  });

  it('wraps Hebrew at spaces like any other text', () => {
    expect(wrapLines('שלום עולם טוב מאוד', 9, measure)).toEqual(['שלום עולם', 'טוב מאוד']);
  });
});
