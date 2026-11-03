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
});
