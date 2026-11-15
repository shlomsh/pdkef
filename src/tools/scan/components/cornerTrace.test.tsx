import { render } from 'preact';
import { useRef } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { Point } from '#lib/pageEnhance/quad.ts';
import styles from './CornerEditor.module.css';
import { CornerTracePath, tracePath, useCornerTrace } from './cornerTrace.tsx';

const TRACE: Point[] = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.12 }, { x: 0.88, y: 0.9 }, { x: 0.1, y: 0.85 }];

let container: HTMLElement | null = null;
let api: ReturnType<typeof useCornerTrace> | null = null;

function Harness({ trace }: { trace: Point[] | null }) {
  const outlineRef = useRef<SVGPolygonElement | null>(null);
  const dimRef = useRef<SVGPathElement | null>(null);
  const gestureRef = useRef<unknown>(null);
  api = useCornerTrace(trace, outlineRef, dimRef, gestureRef);
  return (
    <svg>
      <polygon ref={outlineRef} class={`${styles['outline']} ${styles['outline-faint']}`} />
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

describe('tracePath', () => {
  it('starts with M, has one L per further point, and ends with Z', () => {
    const d = tracePath(TRACE);
    expect(d.startsWith('M')).toBe(true);
    expect(d.match(/L/g)).toHaveLength(TRACE.length - 1);
    expect(d.endsWith('Z')).toBe(true);
  });
});

describe('useCornerTrace', () => {
  it('draws no path for a null or empty trace', () => {
    expect(mount(null).querySelector('path[data-trace]')).toBeNull();
    expect(api!.hasTrace).toBe(false);
    act(() => render(<Harness trace={[]} />, container!));
    expect(container!.querySelector('path[data-trace]')).toBeNull();
    expect(api!.hasTrace).toBe(false);
  });

  it('showTrace(false) hides the path and drops the faint class; showTrace(true) restores both', () => {
    mount(TRACE);
    const path = container!.querySelector<SVGPathElement>('path[data-trace]')!;
    const polygon = container!.querySelector('polygon')!;
    expect(api!.hasTrace).toBe(true);
    act(() => api!.showTrace(false));
    expect(path.style.display).toBe('none');
    expect(polygon.getAttribute('class')).not.toMatch(/outline-faint/);
    act(() => api!.showTrace(true));
    expect(path.style.display).toBe('');
    expect(polygon.getAttribute('class')).toMatch(/outline-faint/);
  });
});
