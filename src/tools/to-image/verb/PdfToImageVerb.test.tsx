import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import PdfToImageVerb from './PdfToImageVerb.tsx';

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<PdfToImageVerb />, host));
  return host;
}

describe('PdfToImageVerb', () => {
  it('renders one print', () => {
    const host = mount();
    expect(host.querySelectorAll('i').length).toBe(1);
  });
});
