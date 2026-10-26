// @ts-nocheck - matches the other .tsx island tests
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import RemovePagesVerb from './RemovePagesVerb.tsx';

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<RemovePagesVerb />, host));
  return host;
}

describe('RemovePagesVerb', () => {
  it('renders four pages', () => {
    const host = mount();
    expect(host.querySelectorAll('i').length).toBe(4);
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
