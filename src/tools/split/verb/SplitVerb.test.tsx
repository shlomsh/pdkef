import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import SplitVerb from './SplitVerb.tsx';

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<SplitVerb />, host));
  return host;
}

describe('SplitVerb', () => {
  it('renders two decks of five pages, ten in all', () => {
    const host = mount();
    const decks = host.querySelectorAll('[data-deck]');
    expect(decks.length).toBe(2);
    decks.forEach((deck) => expect(deck.querySelectorAll('i').length).toBe(5));
    expect(host.querySelectorAll('i').length).toBe(10);
  });
});
