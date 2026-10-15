// @ts-nocheck - matches the other .tsx island tests
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import RedactVerb from './RedactVerb.tsx';

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<RedactVerb />, host));
  return host;
}

describe('RedactVerb', () => {
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

  it('blurs two lines inside the frost box', () => {
    const host = mount();
    const frost = host.querySelector('[data-part="frost"]');
    expect(frost).not.toBeNull();
    expect(frost.querySelectorAll('[data-part="blurred-line"]').length).toBe(2);
  });

  it('has a watermark and a white-out box over the footer', () => {
    const host = mount();
    expect(host.querySelector('[data-part="watermark"]')).not.toBeNull();
    expect(host.querySelector('[data-part="whiteout"]')).not.toBeNull();
  });
});
