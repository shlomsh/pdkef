// @ts-nocheck - matches the other .tsx island tests
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

  it('hides the whole stage from assistive tech', () => {
    const host = mount();
    expect(host.firstElementChild.getAttribute('aria-hidden')).toBe('true');
  });

  it('never carries a style attribute (CSP)', () => {
    const host = mount();
    expect(host.querySelectorAll('[style]').length).toBe(0);
  });

  it('has no text', () => {
    const host = mount();
    expect(host.textContent).toBe('');
  });
});
