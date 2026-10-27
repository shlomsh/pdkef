import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import MergeVerb from './MergeVerb.tsx';

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<MergeVerb />, host));
  return host;
}

describe('MergeVerb', () => {
  it('renders five pages', () => {
    const host = mount();
    expect(host.querySelectorAll('i').length).toBe(5);
  });

  it('hides the whole stage from assistive tech', () => {
    const host = mount();
    expect(host.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
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
