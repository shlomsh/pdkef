// @ts-nocheck - matches the other .tsx island tests
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import ScanVerb from './ScanVerb.tsx';

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<ScanVerb />, host));
  return host;
}

describe('ScanVerb', () => {
  it('renders one photo with four corner dots', () => {
    const host = mount();
    expect(host.querySelectorAll('i').length).toBe(1);
    expect(host.querySelectorAll('i b').length).toBe(4);
  });

  it('hides the whole stage from assistive tech', () => {
    expect(mount().firstElementChild.getAttribute('aria-hidden')).toBe('true');
  });

  it('never carries a style attribute (CSP)', () => {
    expect(mount().querySelectorAll('[style]').length).toBe(0);
  });

  it('has no text', () => {
    expect(mount().textContent).toBe('');
  });
});
