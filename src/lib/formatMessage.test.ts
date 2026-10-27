import { describe, expect, it } from 'vitest';
import { formatMessage } from './formatMessage.ts';

describe('formatMessage', () => {
  it('fills a placeholder', () => {
    expect(formatMessage('Hello {name}', { name: 'Dana' })).toBe('Hello Dana');
  });

  it('fills every occurrence and several keys', () => {
    expect(formatMessage('{a} and {b} and {a}', { a: 'x', b: 'y' })).toBe('x and y and x');
  });

  it('stringifies numbers, including zero', () => {
    expect(formatMessage('{n} pages', { n: 0 })).toBe('0 pages');
    expect(formatMessage('{n} pages', { n: 12 })).toBe('12 pages');
  });

  it('keeps a token with no matching param', () => {
    expect(formatMessage('Hi {who}', {})).toBe('Hi {who}');
  });

  it('does not treat non-word braces as tokens', () => {
    expect(formatMessage('{a-b} { a } {}', { a: 'x' })).toBe('{a-b} { a } {}');
  });

  it('returns a template with no tokens unchanged', () => {
    expect(formatMessage('plain', { a: 'x' })).toBe('plain');
  });

  it('inserts replacement text literally', () => {
    expect(formatMessage('{a}', { a: '$& $1' })).toBe('$& $1');
  });
});
