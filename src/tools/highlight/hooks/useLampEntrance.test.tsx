import { render } from 'preact';
import { act } from 'preact/test-utils';
import { useRef, useState } from 'preact/hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLampEntrance } from './useLampEntrance.ts';

interface Played { part: string | null; frames: Keyframe[]; cancel: ReturnType<typeof vi.fn>; finish(): void }
let played: Played[] = [];
let toggles = 0;
let api: { toggle(): void; setLamp(on: boolean): void };
let container: HTMLElement | null = null;

const BOXES: Record<string, [number, number, number, number]> = {
  bead: [710, 262, 20, 20], cord: [720, 252, 0, 0], pill: [481, 24, 477, 48],
};

function Harness() {
  const [lamp, setLamp] = useState(false);
  const ws = useRef<HTMLDivElement | null>(null);
  const toggle = useLampEntrance({ workspaceRef: ws, fullscreen: lamp, toggleLamp: () => { toggles += 1; setLamp((v) => !v); } });
  api = { toggle, setLamp };
  return (
    <div>
      <div data-lamp-part="site"><div data-tool-shell><div data-lamp-part="cord"><div data-lamp-part="settle"><span data-lamp-part="line" /><button data-lamp-part="pull"><span data-lamp-bead /></button><span data-lamp-part="tag" /></div></div></div></div>
      <div ref={ws} data-workspace>
        {lamp && <div data-lamp-part="capsule"><div role="toolbar" data-pill /></div>}
        {["veil", "cone", "string", "ring"].map((part) => <div key={part} data-lamp-part={part} />)}
        <div data-lamp-part="morph"><i data-lamp-part="face" /></div>
        <div data-lamp-part="ghost" />
        <div data-lamp-part="board"><div data-page-wrapper data-lamp-page /></div>
      </div>
    </div>
  );
}

function stubLayout() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const key = this.hasAttribute('data-lamp-bead') ? 'bead' : this.getAttribute('data-lamp-part') === 'cord' ? 'cord' : this.hasAttribute('data-pill') ? 'pill' : null;
    const [left, top, width, height] = key ? BOXES[key] : this.hasAttribute('data-lamp-page') ? [100, 300, 200, 280] : [0, 0, 1000, 800];
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} } as DOMRect;
  });
}

beforeEach(() => {
  played = []; toggles = 0;
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value(this: Element, frames: Keyframe[]) {
      let end!: () => void;
      const finished = new Promise<void>((resolve) => { end = resolve; });
      const a = { part: this.getAttribute('data-lamp-part'), frames, finished, cancel: vi.fn(() => end()), finish: () => end() };
      played.push(a);
      return a;
    },
  });
  stubLayout();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  container = document.createElement('div');
  act(() => render(<Harness />, container!));
});
afterEach(() => {
  act(() => render(null, container!));
  vi.restoreAllMocks();
  delete (Element.prototype as { animate?: unknown }).animate;
  vi.unstubAllGlobals();
});

const parts = () => played.map((p) => p.part);
/** The plan is made a microtask after the view changes. */
const flush = () => act(async () => { await Promise.resolve(); });

describe('useLampEntrance', () => {
  it('a press measures first, flips the lamp, then plays the way in on the stage, the capsule and the page', async () => {
    act(() => api.toggle());
    await flush();
    expect(toggles).toBe(1);
    expect(parts()).toEqual(expect.arrayContaining(['string', 'morph', 'face', 'capsule', 'board']));
    const morph = played.find((p) => p.part === 'morph')!;
    expect(morph.frames[0]).toMatchObject({ left: '710px', top: '262px', width: '20px' });
    expect(morph.frames.at(-1)).toMatchObject({ left: '481px', width: '477px', height: '48px' });
  });

  it('ignores a second press while the entrance runs, and hands every node back when it ends', async () => {
    act(() => api.toggle());
    await flush();
    act(() => api.toggle());
    expect(toggles).toBe(1);
    await act(async () => { played.forEach((p) => p.finish()); await Promise.resolve(); await Promise.resolve(); });
    played.forEach((p) => expect(p.cancel, p.part ?? '').toHaveBeenCalled());
    act(() => api.toggle());
    expect(toggles).toBe(2);
  });

  it('leaving by Esc, with no press, cancels the entrance under way and plays the exit from the remembered capsule', async () => {
    act(() => api.toggle());
    await flush();
    const entering = [...played];
    act(() => api.setLamp(false));
    await flush();
    entering.forEach((p) => expect(p.cancel).toHaveBeenCalled());
    expect(played.slice(entering.length).map((p) => p.part)).toEqual(expect.arrayContaining(['morph', 'pull', 'line', 'settle', null]));
  });

  it('the capsule\'s own exit plays the exit with the page shrinking back, and leaves no copy behind afterwards', async () => {
    act(() => api.toggle());
    await flush();
    await act(async () => { played.forEach((p) => p.finish()); await Promise.resolve(); await Promise.resolve(); });
    const before = played.length;
    act(() => api.toggle());
    await flush();
    expect(container!.querySelector('[data-lamp-part="ghost"] [role="toolbar"]')).not.toBeNull();
    expect(played.slice(before).map((p) => p.part)).toContain('board');
    await act(async () => { played.slice(before).forEach((p) => p.finish()); await Promise.resolve(); await Promise.resolve(); });
    expect(container!.querySelector('[data-lamp-part="ghost"]')!.childElementCount).toBe(0);
  });

  it('with reduced motion nothing travels: the capsule fades in', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    act(() => api.toggle());
    await flush();
    expect(parts()).toEqual(['capsule']);
  });
});
