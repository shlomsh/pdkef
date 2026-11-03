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
});
