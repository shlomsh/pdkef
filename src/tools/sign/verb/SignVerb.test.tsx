import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import SignVerb from './SignVerb.tsx';

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<SignVerb />, host));
  return host;
}

describe('SignVerb', () => {
  it('draws the signature as a path with pathLength 1', () => {
    const host = mount();
    const sig = host.querySelector('path');
    expect(sig).not.toBeNull();
    expect(sig.getAttribute('pathLength')).toBe('1');
  });

  it('has the field and the caret', () => {
    const host = mount();
    expect(host.querySelectorAll('rect').length).toBeGreaterThan(0);
    expect(host.querySelectorAll('i').length).toBeGreaterThanOrEqual(4);
  });
});
