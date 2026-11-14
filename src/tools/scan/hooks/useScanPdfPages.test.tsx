import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScanWork } from '../state/scanWork.ts';
import { useScanPdfPages } from './useScanPdfPages.ts';

vi.mock('#lib/telemetry/errorReport.ts', () => ({ reportError: vi.fn() }));
const gates: Array<() => void> = [];
let failing = false;
const sheetFile = () => new File(['x'], 's.png', { type: 'image/png' });
const QUAD = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
// Each sheet after the first waits for the test to let it through.
vi.mock('../lib/pdfSheets.ts', () => ({
  pdfSheets: async function* () {
    if (failing) throw new Error('cannot open');
    yield { file: sheetFile(), quads: [QUAD] };
    await new Promise<void>((resolve) => gates.push(resolve));
    yield { file: sheetFile(), quads: [QUAD] };
  },
}));

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
  gates.length = 0;
  failing = false;
});

function mount(work: ScanWork) {
  const added: unknown[][] = [];
  const skipped = vi.fn();
  const inspect = vi.fn();
  let open!: (pdfs: File[]) => Promise<void>;
  const unmountedRef = { current: false };
  function Host() {
    open = useScanPdfPages({ work, unmountedRef, setPages: (update) => added.push(typeof update === 'function' ? update([]) : update), dispatch: vi.fn(), skipped, inspect });
    return null;
  }
  container = document.createElement('div');
  act(() => render(<Host />, container!));
  return { added, skipped, open: (pdf: File) => open([pdf]) };
}
const pdf = () => new File(['x'], 'a.pdf', { type: 'application/pdf' });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('useScanPdfPages', () => {
  it('adds no sheet that arrives after the import was cancelled, and reports no failure', async () => {
    const work = new ScanWork();
    const { added, skipped, open } = mount(work);
    const done = open(pdf());
    await tick();
    expect(added).toHaveLength(1);
    work.cancelPdfImport();
    gates[0]();
    await done;
    expect(added).toHaveLength(1);
    expect(skipped).not.toHaveBeenCalled();
  });

  it('names each PDF it could not open, as a PDF that could not be opened', async () => {
    failing = true;
    const { skipped, open } = mount(new ScanWork());
    await open(new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    await open(new File(['x'], 'b.pdf', { type: 'application/pdf' }));
    expect(skipped.mock.calls).toEqual([[[{ name: 'a.pdf', reason: 'pdf' }]], [[{ name: 'b.pdf', reason: 'pdf' }]]]);
  });

  it('still imports after a cancel', async () => {
    const work = new ScanWork();
    const { added, open } = mount(work);
    work.cancelPdfImport();
    const done = open(pdf());
    await tick();
    gates[0]();
    await done;
    expect(added).toHaveLength(2);
  });
});
