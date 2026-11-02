import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import MarkOutline from './MarkOutline.tsx';

const mark: HighlightElement = {
  id: 'h1', type: 'highlight', pageIndex: 0, left: 10, top: 20, width: 30, height: 10,
  color: '#FFF34D', bands: [{ left: 0, top: 0, width: 100, height: 40 }, { left: 0, top: 60, width: 70, height: 40 }],
};
const box = { width: 180, height: 80 };

let host: HTMLElement;
afterEach(() => { act(() => render(null, host)); host.remove(); });

async function draw(props: Partial<Parameters<typeof MarkOutline>[0]> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<MarkOutline mark={mark} boxPts={box} turns={0} {...props} />, host));
  await vi.waitFor(() => expect(host.querySelector('svg[data-mark-outline]')).not.toBeNull(), { timeout: 3000 });
  return host.querySelector('svg[data-mark-outline]');
}

describe('MarkOutline', () => {
  it('READ-13: draws one path over the mark box in points, once rough.js has loaded', async () => {
    const svg = await draw();
    expect(svg!.getAttribute('viewBox')).toBe('0 0 180 80');
    expect(svg!.querySelector('path')!.getAttribute('d')).toMatch(/^M/);
  });

  it('the same mark draws the same outline every time it opens', async () => {
    const first = (await draw())!.querySelector('path')!.getAttribute('d');
    act(() => render(null, host)); host.remove();
    const second = (await draw())!.querySelector('path')!.getAttribute('d');
    expect(second).toBe(first);
  });

  it('a different mark draws a different one', async () => {
    const first = (await draw())!.querySelector('path')!.getAttribute('d');
    act(() => render(null, host)); host.remove();
    const second = (await draw({ mark: { ...mark, id: 'h2' } }))!.querySelector('path')!.getAttribute('d');
    expect(second).not.toBe(first);
  });
});
