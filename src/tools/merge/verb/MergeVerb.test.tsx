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
});
