import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { measureBefore, partsIn, planAfter } from './lampDom.ts';

let root: HTMLElement;
let ws: HTMLElement;

function box(el: Element, left: number, top: number, width: number, height: number) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} } as DOMRect);
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  root = document.createElement('div');
  root.innerHTML = `
    <div data-lamp-part="site"><div id="shell"><div data-lamp-part="cord"><span data-lamp-bead></span></div></div></div>
    <div id="ws"><div data-lamp-part="capsule"><div role="toolbar"></div></div>
      <div data-page-wrapper id="p0"></div><div data-page-wrapper id="p1"></div></div>`;
  ws = root.querySelector<HTMLElement>('#ws')!;
  box(ws, 0, 0, 1000, 800);
  box(root.querySelector('[data-lamp-part="cord"]')!, 500, 250, 0, 0);
  // The bead's rect is what the drop-in's squash leaves (a 1 px dot); its offset box is the rest position, 20 px at (-10, 20) from the cord.
  const bead = root.querySelector('[data-lamp-bead]')!;
  box(bead, 500, 251, 1, 1);
  for (const [prop, value] of [['offsetLeft', -10], ['offsetTop', 20], ['offsetWidth', 20], ['offsetHeight', 20]] as const) Object.defineProperty(bead, prop, { configurable: true, value });
  box(root.querySelector('[role="toolbar"]')!, 300, 12, 400, 48);
  box(root.querySelector('#p0')!, 100, 300, 200, 280);
  box(root.querySelector('#p1')!, 100, 900, 200, 280);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('lampDom', () => {
  it('finds the parts from the tool\'s parent, the site being what its wrapper holds', () => {
    const find = partsIn(ws);
    expect(find('site').map((el) => el.id)).toEqual(['shell']);
    expect(find('cord')).toHaveLength(1);
    expect(find('morph')).toEqual([]);
  });

  it('measures the page nearest the middle of the view, the bead and the top of its cord', () => {
    const before = measureBefore('enter', ws);
    expect(before.pageIndex).toBe(0);
    expect(before.page).toEqual({ left: 100, top: 300, width: 200, height: 280 });
    expect(before.bead).toEqual({ cx: 500, cy: 280, r: 10 });
    expect(planAfter('exit', ws, null, { left: 300, top: 12, width: 400, height: 48 }).plan.tracks.find((t) => t.part === 'morph')!.keys.at(-2)).toMatchObject({ left: '490px', top: '270px', width: '20px' });
    expect(before.cordTop).toBe(250);
    expect(measureBefore('exit', ws).capsule).toEqual({ left: 300, top: 12, width: 400, height: 48 });
  });

  it('plans the full entrance when everything was measured, and the crossfade when the capsule is missing', () => {
    const before = measureBefore('enter', ws);
    expect(planAfter('enter', ws, before, null).plan.tracks.map((t) => t.part)).toContain('morph');
    root.querySelector('[data-lamp-part="capsule"]')!.remove();
    expect(planAfter('enter', ws, before, null).plan.tracks.map((t) => t.part)).toEqual(['capsule']);
  });

  it('an exit nobody pressed uses the capsule remembered from the way in', () => {
    const remembered = { left: 300, top: 12, width: 400, height: 48 };
    expect(planAfter('exit', ws, null, remembered).plan.tracks.map((t) => t.part)).toContain('morph');
    expect(planAfter('exit', ws, null, null).plan.tracks.map((t) => t.part)).toEqual(['site']);
  });

  it('reduced motion is always the crossfade', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(planAfter('enter', ws, measureBefore('enter', ws), null).plan.tracks.map((t) => t.part)).toEqual(['capsule']);
  });
});
