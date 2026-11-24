// @vitest-environment jsdom
import { render } from 'preact';
import { useRef } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import CompareFullscreen from './CompareFullscreen.tsx';
import { useComparePreviews } from '../hooks/useComparePreviews.ts';
import { englishCompressMessages } from '../messages';

type Compare = ReturnType<typeof useComparePreviews>;

function Stage({ apiRef }: { apiRef: { current: Compare | null } }) {
  const runTokenRef = useRef(0);
  const compare = useComparePreviews({ runTokenRef });
  apiRef.current = compare;
  return <CompareFullscreen t={englishCompressMessages} compare={compare} caption="Page 1" fit />;
}

let host: HTMLElement | null = null;
afterEach(() => {
  if (host) {
    act(() => render(null, host!));
    host.remove();
    host = null;
  }
});

describe('CompareFullscreen', () => {
  it('the full screen dialog keeps the tags', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const apiRef: { current: Compare | null } = { current: null };
    act(() => render(<Stage apiRef={apiRef} />, host!));
    const photo = new File([new Uint8Array(90_000)], 'photo.jpg', { type: 'image/jpeg' });
    const out = new Blob([new Uint8Array(30_000)], { type: 'image/jpeg' });
    await act(async () => { await apiRef.current!.open(photo, out); });
    await act(async () => { await apiRef.current!.openFullscreen(photo, out); });
    const dialog = host.querySelector('dialog[aria-label]')!;
    expect(dialog.getAttribute('aria-label')).toBe('Full screen');
    expect(dialog.querySelectorAll('img')).toHaveLength(2);
    expect(dialog.querySelectorAll('img ~ span')).toHaveLength(2);
    expect(Array.from(dialog.querySelectorAll('img ~ span')).map((s) => s.textContent)).toEqual(['Compressed', 'Original']);
  });
});
