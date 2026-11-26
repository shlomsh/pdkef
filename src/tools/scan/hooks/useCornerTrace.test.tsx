import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import type { Pins, Sides } from '../lib/edges/follow.ts';
import type { ScanPage } from '../state/scanWork.ts';
import { useCornerTrace } from './useCornerTrace.ts';

const Q1: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
const Q2: Quad = [{ x: 0.2, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.2, y: 0.9 }];
const side = Array.from({ length: 15 }, (_, i) => ({ x: 0.3 + i * 0.01, y: 0.5 }));
const SIDES = [side, side, side, side] as Sides;
const page = (quad: Quad, pins: Pins | null = null, fine = true) => ({ id: 1, quad, turns: 0, pins, fine }) as unknown as ScanPage;
type OnTrace = (id: number, quad: Quad, pins?: Pins | null) => Promise<Sides | null>;

let container: HTMLElement | null = null;
let shown: Sides | null = null;
let renders = 0;
function Probe({ selected, onTrace }: { selected: ScanPage; onTrace: OnTrace }) {
  renders += 1;
  shown = useCornerTrace(selected, onTrace);
  return null;
}
const view = (selected: ScanPage, onTrace: OnTrace) => <Probe selected={selected} onTrace={onTrace} />;
const mount = (selected: ScanPage, onTrace: OnTrace) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(view(selected, onTrace), container!));
};
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
  shown = null;
  renders = 0;
});

describe('useCornerTrace', () => {
  it('with fine off asks for no trace and shows none', async () => {
    // Forced: onTrace is always traceCorners, which needs a decoded photo and jsdom decodes none
    const onTrace = vi.fn().mockResolvedValue(SIDES);
    mount(page(Q1, null, false), onTrace);
    await flush();
    expect(onTrace).not.toHaveBeenCalled();
    expect(shown).toBeNull();
  });

  it('with fine on asks for the trace of the page\'s own quad and pins on mount, and shows the answer', async () => {
    // Forced: onTrace is always traceCorners, which needs a decoded photo and jsdom decodes none
    const onTrace = vi.fn().mockResolvedValue(SIDES);
    mount(page(Q1), onTrace);
    expect(onTrace).toHaveBeenCalledWith(1, Q1, null);
    await flush();
    expect(shown).toBe(SIDES);
  });

  it('drops an answer for an older quad that arrives after the quad changed', async () => {
    let late!: (s: Sides | null) => void;
    // Forced: onTrace is always traceCorners, which needs a decoded photo and jsdom decodes none (held, then answered)
    const onTrace = vi.fn()
      .mockImplementationOnce(() => new Promise<Sides | null>((r) => { late = r; }))
      .mockResolvedValue(null);
    mount(page(Q1), onTrace);
    act(() => render(view(page(Q2), onTrace), container!));
    await flush();
    expect(onTrace).toHaveBeenCalledTimes(2);
    late(SIDES);
    await flush();
    expect(shown).toBeNull();
  });

  it('asks again with the pins after a pin changes, and shows no outline for the previous pins', async () => {
    // Forced: onTrace is always traceCorners, which needs a decoded photo and jsdom decodes none
    const onTrace = vi.fn().mockResolvedValue(SIDES);
    mount(page(Q1), onTrace);
    await flush();
    expect(shown).toBe(SIDES);
    const pins: Pins = [[], [], [], [{ k: 3, at: { x: 0.2, y: 0.5 } }]];
    onTrace.mockImplementationOnce(() => new Promise(() => {}));
    act(() => render(view(page(Q1, pins), onTrace), container!));
    expect(onTrace).toHaveBeenLastCalledWith(1, Q1, pins);
    expect(shown).toBeNull();
  });

  it('renders again only when an answer lands, not when a trace is asked for or let go', async () => {
    let answer: (sides: Sides | null) => void = () => {};
    // Forced: onTrace is always traceCorners, which needs a decoded photo and jsdom decodes none
    const onTrace = vi.fn((): Promise<Sides | null> => new Promise((done) => { answer = done; }));
    mount(page(Q1), onTrace);
    await flush();
    expect(renders).toBe(1);
    answer(SIDES);
    await flush();
    expect(renders).toBe(2);
    expect(shown).toBe(SIDES);
    act(() => render(view(page(Q1, null, false), onTrace), container!));
    expect(renders).toBe(3);
    expect(shown).toBeNull();
  });
});
