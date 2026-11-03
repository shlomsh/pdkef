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
});
