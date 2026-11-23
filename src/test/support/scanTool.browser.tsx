import { render, type ComponentType } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, vi } from 'vitest';
import { drainPromises } from './drainPromises.ts';
import { setInputFiles } from './setInputFiles.js';
import { until } from './until.js';

const SHEET = { width: 600, height: 800, pageWidth: 0.78, pageHeight: 0.82, angle: 0.06 };

const encoded = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('the photo did not encode'))), 'image/jpeg', 0.95);
});

const drawn = (width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d') as CanvasRenderingContext2D);
  return encoded(canvas);
};

/** A real photo of a light page with dark lines, turned a little on a dark desk: the edge guess finds its corners. */
export async function photoOfPage(name: string, angle = SHEET.angle) {
  const blob = await drawn(SHEET.width, SHEET.height, (ctx) => {
    ctx.fillStyle = '#2b2118';
    ctx.fillRect(0, 0, SHEET.width, SHEET.height);
    ctx.translate(SHEET.width / 2, SHEET.height / 2);
    ctx.rotate(angle);
    const w = SHEET.width * SHEET.pageWidth;
    const h = SHEET.height * SHEET.pageHeight;
    ctx.fillStyle = '#f2efe6';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = '#222222';
    for (let i = 0; i < 22; i += 1) ctx.fillRect(-w / 2 + 40, -h / 2 + 50 + i * 26, w - 80 - (i % 5) * 30, 8);
  });
  return new File([blob], name, { type: 'image/jpeg' });
}

/** Where `photoOfPage` drew its page's corners, 0 to 1 of the photo, from the top left clockwise. */
export function drawnCorners(angle = SHEET.angle) {
  const w = (SHEET.width * SHEET.pageWidth) / 2;
  const h = (SHEET.height * SHEET.pageHeight) / 2;
  return [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => ({
    x: 0.5 + (x * Math.cos(angle) - y * Math.sin(angle)) / SHEET.width,
    y: 0.5 + (x * Math.sin(angle) + y * Math.cos(angle)) / SHEET.height,
  }));
}

/** A real photo with no page in it: the edge guess answers null. */
export async function photoOfNothing(name: string) {
  const blob = await drawn(400, 300, (ctx) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 400, 300);
  });
  return new File([blob], name, { type: 'image/jpeg' });
}

/** A .jpg whose bytes are no image: reading it really fails. */
export const brokenPhoto = (name: string) => new File([new Uint8Array(500).fill(7)], name, { type: 'image/jpeg' });

/** A style value as Chromium writes it back: it keeps six digits. */
export function cssPercent(fraction: number) {
  const probe = document.createElement('div');
  probe.style.left = `${fraction * 100}%`;
  return probe.style.left;
}

type StepFn = (...args: any[]) => Promise<any>;
export type StepName = 'guessPage' | 'inspectPhoto' | 'processPage' | 'turnImage' | 'buildScanPdf';
const STEPS: StepName[] = ['guessPage', 'inspectPhoto', 'processPage', 'turnImage', 'buildScanPdf'];

interface SuiteHarness {
  restore(): Promise<void>;
  flush(): Promise<unknown>;
  usageEvents(name?: string): Array<{ name: string; properties: Record<string, unknown> }>;
}

interface SuiteDeps<H extends SuiteHarness> {
  Tool: ComponentType<any>;
  installToolHarness: () => Promise<H>;
  /**
   * `spy` is the pipeline module of a test file that has `vi.mock('./lib/scanPipeline.ts', { spy: true })`, `real` the
   * same module from `vi.importActual`. Every step runs for real; the spies read its calls.
   */
  pipeline: { spy: Record<StepName, StepFn>; real: Record<StepName, StepFn> };
}

const QUIET = { baseMs: 100, stepMs: 50, maxMs: 300, burstWindowMs: 1000 };

export function useScanSuite<H extends SuiteHarness>({ Tool, installToolHarness, pipeline }: SuiteDeps<H>) {
  const s = { container: document.createElement('div'), harness: undefined as unknown as H };
  const gates: Array<() => void> = [];
  const step = (name: StepName) => vi.mocked(pipeline.spy[name]);

  function holdNext(name: StepName) {
    const started = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();
    let result: Promise<unknown> | undefined;
    gates.push(gate.resolve);
    // forced: the step is held at its start, then runs for real.
    step(name).mockImplementationOnce(async (...args: unknown[]) => {
      started.resolve();
      await gate.promise;
      result = pipeline.real[name](...args);
      return result;
    });
    return {
      /** Await it outside `act`: the step starts from a render, which `act` would hold back. */
      started: started.promise,
      async runToEnd() {
        gate.resolve();
        await act(async () => {
          await started.promise;
          await Promise.resolve(result).catch(() => undefined);
          await drainPromises();
        });
      },
    };
  }

  /** Every step started so far has ended, so none is left in the page worker for the next test. */
  async function idle() {
    for (let seen = -1, total = 0; seen !== total;) {
      seen = total;
      const running = STEPS.flatMap((name) => step(name).mock.results.map((r) => r.value));
      await Promise.allSettled(running);
      await drainPromises();
      total = STEPS.reduce((sum, name) => sum + step(name).mock.results.length, 0);
    }
  }

  beforeEach(async () => {
    s.harness = await installToolHarness();
    for (const name of STEPS) step(name).mockReset();
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (s.container.isConnected) unmount();
    for (const open of gates.splice(0)) open();
    await idle();
    vi.restoreAllMocks();
    await s.harness.restore();
  });

  function mount() {
    s.container = document.createElement('div');
    document.body.append(s.container);
    act(() => { render(<Tool quietPolicy={QUIET} />, s.container); });
  }

  function unmount() {
    act(() => render(null, s.container));
    s.container.remove();
  }

  /** What the real step answered for the photo named `name`, its latest run. */
  const answered = async (stepName: StepName, name: string) => {
    const { calls, results } = step(stepName).mock;
    const at = calls.findLastIndex(([file]) => (file as File).name === name);
    if (at < 0) throw new Error(`${stepName} never ran for ${name}`);
    return results[at].value;
  };

  return { s, step, holdNext, idle, answered, mount, unmount, ...scanActions(s) };
}

interface SuiteState { container: HTMLElement }

function scanActions(s: SuiteState) {
  const all = (selector: string, root: ParentNode = s.container) => Array.from(root.querySelectorAll<HTMLElement>(selector));
  const one = (selector: string) => {
    const el = s.container.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`Expected ${selector}`);
    return el;
  };
  const named = (list: HTMLElement[], text: string) => list.filter((el) => el.textContent?.trim() === text);
  const click = (el: HTMLElement | undefined, what: string) => {
    if (!el) throw new Error(`Expected ${what}`);
    return act(async () => { el.click(); });
  };

  const tableTiles = () => all('[data-table-page]');
  const viewer = () => s.container.querySelector<HTMLElement>('[data-page-viewer]');
  const onTable = () => viewer() === null;
  const heading = () => one('[data-page-heading]').textContent ?? '';
  const handles = () => all('[role="group"] button');
  const byText = (text: string) => named(all('button'), text);
  const inViewer = (text: string) => named(all('[data-page-viewer] button'), text);
  const press = (text: string) => click(byText(text)[0], `a button reading ${text}`);
  const pressInViewer = (text: string) => click(inViewer(text)[0], `a button of the viewer reading ${text}`);
  const startScanning = () => named(all('label'), 'Start scanning')[0];
  const currentPaper = () => one('[data-page-viewer] [data-current] [data-paper]');

  const pick = async (files: File[]) => {
    await act(async () => { setInputFiles(one('input[type="file"]:not([capture])'), files); });
  };
  /** The tiles are on the table and every page has its result on them. */
  const pagesMade = (count: number) => until(() => tableTiles().length === count && tableTiles().every((tile) => tile.querySelector('img')));
  const pdfReady = () => until(() => s.container.querySelector('[data-scan-ready]') !== null);
  const openPage = async (n: number) => {
    await click(tableTiles()[n - 1], `page ${n} on the table`);
    await until(() => !onTable());
  };
  const adjustCorners = () => press('Edges');
  const openCorners = async (n: number) => {
    await openPage(n);
    await adjustCorners();
    await until(() => handles().length === 4);
  };
  const useCorners = () => press('Use these edges');
  const done = () => press('Done');
  const radioGroup = (label: string) => {
    const group = all('[role="radiogroup"]').find((g) => (g.getAttribute('aria-label')
      ?? s.container.querySelector(`#${g.getAttribute('aria-labelledby')}`)?.textContent) === label);
    if (!group) throw new Error(`Expected the radio group ${label}`);
    return group;
  };
  const checked = (label: string) => radioGroup(label).querySelector('[aria-checked="true"]')?.textContent?.trim();
  const choose = (label: string, option: string) => click(all('button', radioGroup(label)).find((b) => b.textContent === option), `${option} in ${label}`);

  return {
    all, one, click, tableTiles, viewer, onTable, heading, handles, byText, inViewer, press, pressInViewer, startScanning, currentPaper,
    pick, pagesMade, pdfReady, openPage, adjustCorners, openCorners, useCorners, done, radioGroup, checked, choose,
  };
}
