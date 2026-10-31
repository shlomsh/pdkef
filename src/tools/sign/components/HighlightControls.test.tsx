import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import { englishSignMessages } from '../messages';
import HighlightControls from './HighlightControls.tsx';

const element = (direction?: 'ltr' | 'rtl'): HighlightElement => ({
  id: 'h1', type: 'highlight', pageIndex: 0, color: '#ff0', left: 10, top: 20, width: 40, height: 10,
  bands: [{ left: 0, top: 0, width: 100, height: 100 }],
  ...(direction ? { direction } : {}),
});

let host: HTMLDivElement | null = null;
const mount = (el: HighlightElement, onChange = vi.fn()) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<HighlightControls element={el} onChange={onChange} t={englishSignMessages} />, host!));
  return onChange;
};
afterEach(() => {
  if (host) render(null, host);
  host?.remove();
  host = null;
});

describe('HighlightControls direction button', () => {
  it('carries the text toolbar aria label for the current direction and flips to rtl on click', () => {
    const onChange = mount(element());
    const button = host!.querySelector<HTMLButtonElement>(`[aria-label="${englishSignMessages.directionLtrAria}"]`)!;
    expect(button).toBeTruthy();
    act(() => button.click());
    expect(onChange).toHaveBeenCalledWith({ direction: 'rtl' });
  });
  it('flips an rtl highlight back to ltr', () => {
    const onChange = mount(element('rtl'));
    const button = host!.querySelector<HTMLButtonElement>(`[aria-label="${englishSignMessages.directionRtlAria}"]`)!;
    act(() => button.click());
    expect(onChange).toHaveBeenCalledWith({ direction: 'ltr' });
  });
});
