import { render } from 'preact';
import { useRef } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { Point } from '#lib/pageEnhance/quad.ts';
import styles from './CornerEditor.module.css';
import { CornerTracePath, dimClip, dotIndices, paintSegments, segments, useCornerTrace } from './cornerTrace.tsx';

const TRACE: Point[] = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.12 }, { x: 0.88, y: 0.9 }, { x: 0.1, y: 0.85 }];

let container: HTMLElement | null = null;
let api: ReturnType<typeof useCornerTrace> | null = null;

function Harness({ trace }: { trace: Point[] | null }) {
  const outlineRef = useRef<SVGGElement | null>(null);
  const dimRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<unknown>(null);
  api = useCornerTrace(trace, outlineRef, dimRef, gestureRef);
  return (
    <svg>
      <g ref={outlineRef} class={`${styles['outline']} ${styles['outline-faint']}`} data-outline />
      {api.hasTrace && <CornerTracePath traceRef={api.traceRef} points={trace!} />}
    </svg>
  );
}
function mount(trace: Point[] | null) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<Harness trace={trace} />, container!));
  return container;
}

afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
  api = null;
});

describe('segments', () => {
  it('is one percent line per point, closed back to the first', () => {
    const s = segments(TRACE);
    expect(s).toHaveLength(TRACE.length);
    expect(s[0]).toEqual({ x1: '10%', y1: '10%', x2: '90%', y2: '12%' });
    expect(s[3]).toEqual({ x1: '10%', y1: '85%', x2: '10%', y2: '10%' });
  });
});

describe('dimClip', () => {
  it('cuts the outline out of the whole photo, evenodd, with percent points closed on the first', () => {
    expect(dimClip(TRACE.slice(0, 2))).toBe('polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, 10% 10%, 90% 12%, 10% 10%)');
  });
});

describe('paintSegments', () => {
  it('writes each line of the group in order, and ignores a missing group', () => {
    mount(TRACE);
    const g = container!.querySelector<SVGGElement>('g[data-trace]')!;
    paintSegments(g, [{ x: 0, y: 0 }, { x: 0.5, y: 0.25 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
    const first = g.querySelector('line')!;
    expect([first.getAttribute('x2'), first.getAttribute('y2')]).toEqual(['50%', '25%']);
    expect(() => paintSegments(null, TRACE)).not.toThrow();
  });
});

describe('useCornerTrace', () => {
  it('draws no path for a null or empty trace', () => {
    expect(mount(null).querySelector('g[data-trace]')).toBeNull();
    expect(api!.hasTrace).toBe(false);
    act(() => render(<Harness trace={[]} />, container!));
    expect(container!.querySelector('g[data-trace]')).toBeNull();
    expect(api!.hasTrace).toBe(false);
  });

  it('showTrace(false) hides the path and drops the faint class; showTrace(true) restores both', () => {
    mount(TRACE);
    const path = container!.querySelector<SVGGElement>('g[data-trace]')!;
    const outline = container!.querySelector('[data-outline]')!;
    expect(api!.hasTrace).toBe(true);
    act(() => api!.showTrace(false));
    expect(path.style.display).toBe('none');
    expect(outline.getAttribute('class')).not.toMatch(/outline-faint/);
    act(() => api!.showTrace(true));
    expect(path.style.display).toBe('');
    expect(outline.getAttribute('class')).toMatch(/outline-faint/);
  });
});

describe('dotIndices', () => {
  it('gives every traced point but the four corners', () => {
    const idx = dotIndices(64, []);
    expect(idx).toHaveLength(60);
    for (const c of [0, 16, 32, 48]) expect(idx).not.toContain(c);
  });

  it('leaves out a pinned point', () => {
    const idx = dotIndices(64, [7]);
    expect(idx).toHaveLength(59);
    expect(idx).not.toContain(7);
  });
});
