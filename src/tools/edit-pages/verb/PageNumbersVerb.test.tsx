import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import PageNumbersVerb from './PageNumbersVerb.tsx';

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<PageNumbersVerb />, host));
  return host;
}

describe('PageNumbersVerb', () => {
  it('renders three pages, each with a number mark', () => {
    const host = mount();
    expect(host.querySelectorAll('i').length).toBe(3);
    expect(host.querySelectorAll('i > b').length).toBe(3);
  });
});
