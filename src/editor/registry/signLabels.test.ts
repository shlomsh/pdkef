import { describe, expect, it } from 'vitest';
import { englishSignMessages } from './signMessages';
import { signUpdateDescription } from './signLabels';

// UNDO-04: signUpdateDescription is the one place an update entry's kind
// resolves to a label, so an added kind or a swapped template shows up here
// rather than only in a rendered history string nobody reads in a unit test.
describe('signUpdateDescription', () => {
  it('names a move by the element label', () => {
    expect(signUpdateDescription(englishSignMessages, 'move', 'text')).toBe('Moved Text');
  });

  it('names a resize by the element label', () => {
    expect(signUpdateDescription(englishSignMessages, 'resize', 'rectangle')).toBe('Resized Rectangle');
  });

  it('names a style change by the element label', () => {
    expect(signUpdateDescription(englishSignMessages, 'style', 'signature')).toBe('Changed Sign style');
  });

  it('names a text edit without interpolating the element label', () => {
    expect(signUpdateDescription(englishSignMessages, 'text', 'text')).toBe('Edited text');
  });
});
