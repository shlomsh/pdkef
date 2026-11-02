import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import MarkHatch from './MarkHatch.tsx';

const mark: HighlightElement = {
  id: 'h1', type: 'highlight', pageIndex: 0, left: 10, top: 20, width: 30, height: 10, style: 'pencil',
  color: '#FFF34D', bands: [{ left: 0, top: 0, width: 100, height: 40 }, { left: 0, top: 60, width: 70, height: 40 }],
};
const box = { width: 180, height: 80 };

let host: HTMLElement;
afterEach(() => { act(() => render(null, host)); host.remove(); });

async function draw(props: Partial<Parameters<typeof MarkHatch>[0]> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<MarkHatch mark={mark} boxPts={box} {...props} />, host));
  await vi.waitFor(() => expect(host.querySelector('svg[data-highlight-hatch]')).not.toBeNull(), { timeout: 3000 });
  return host.querySelector('svg[data-highlight-hatch]')!;
}

describe('MarkHatch', () => {
  it('READ-14: draws the hatch as strokes in the mark color over the box in points, once rough.js has loaded', async () => {
    const svg = await draw();
    expect(svg.getAttribute('viewBox')).toBe('0 0 180 80');
    const path = svg.querySelector('path')!;
    expect(path.getAttribute('d')).toMatch(/^M/);
    expect(path.getAttribute('stroke')).toBe('#FFF34D');
    expect(path.getAttribute('stroke-width')).toBe('1.6');
    expect(path.getAttribute('fill')).toBe('none');
  });

  it('the same mark hatches the same way every time, and another mark differently', async () => {
    const first = (await draw()).querySelector('path')!.getAttribute('d');
    act(() => render(null, host)); host.remove();
    expect((await draw()).querySelector('path')!.getAttribute('d')).toBe(first);
    act(() => render(null, host)); host.remove();
    expect((await draw({ mark: { ...mark, id: 'h2' } })).querySelector('path')!.getAttribute('d')).not.toBe(first);
  });
});
