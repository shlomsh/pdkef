import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import FullscreenButton from './FullscreenButton.tsx';

function mount(extra: { title?: string | null } = {}) {
  const c = document.createElement('div');
  document.body.appendChild(c);
  act(() => render(<FullscreenButton isFullscreen={false} toggleFullscreen={() => {}} {...extra} />, c));
  return c.querySelector('button')!;
}

describe('FullscreenButton title', () => {
  it('keeps the label as its title by default', () => {
    expect(mount().getAttribute('title')).toBe('Full screen');
  });
  it('has no title when asked for null', () => {
    expect(mount({ title: null }).hasAttribute('title')).toBe(false);
  });
});
