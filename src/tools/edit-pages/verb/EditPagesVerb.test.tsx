import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import EditPagesVerb from './EditPagesVerb.tsx';

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<EditPagesVerb />, host));
  return host;
}

describe('EditPagesVerb', () => {
  it('renders four pages', () => {
    const host = mount();
    expect(host.querySelectorAll('i').length).toBe(4);
  });
});
