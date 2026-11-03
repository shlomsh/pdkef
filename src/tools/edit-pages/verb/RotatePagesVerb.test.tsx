import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import RotatePagesVerb from './RotatePagesVerb.tsx';

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<RotatePagesVerb />, host));
  return host;
}

describe('RotatePagesVerb', () => {
  it('renders three pages', () => {
    const host = mount();
    expect(host.querySelectorAll('i').length).toBe(3);
  });
});
