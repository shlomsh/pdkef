// @ts-nocheck - matches the other .tsx island tests
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import UnlockVerb from './UnlockVerb.tsx';

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<UnlockVerb />, host));
  return host;
}

describe('UnlockVerb', () => {
  it('renders one page with its hatching, and a lock with a shackle', () => {
    const host = mount();
    expect(host.querySelectorAll('i').length).toBe(2);
    expect(host.querySelectorAll('svg').length).toBe(1);
    expect(host.querySelectorAll('svg path').length).toBe(1);
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
