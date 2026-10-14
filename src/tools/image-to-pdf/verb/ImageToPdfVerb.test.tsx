// @ts-nocheck - matches the other .tsx island tests
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import ImageToPdfVerb from './ImageToPdfVerb.tsx';

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<ImageToPdfVerb />, host));
  return host;
}

describe('ImageToPdfVerb', () => {
  it('renders three photos', () => {
    expect(mount().querySelectorAll('i').length).toBe(3);
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
