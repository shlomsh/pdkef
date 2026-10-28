import { render, type ComponentType } from 'preact';
import { act } from 'preact/test-utils';
import { expect, vi, afterEach, beforeAll, beforeEach } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import { setInputFiles } from './setInputFiles.js';

// Shared fixtures and the suite setup for the PdfRedactTool.*.test.tsx files. vi.mock is hoisted per
// file, so each of those files repeats the pageSampling mock and steers `pageSampler` from here.


export function required<T>(value: T | null | undefined, description: string): T {
  if (value == null) throw new Error(`Expected ${description}`);
  return value;
}

export function query<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  return required(root.querySelector<T>(selector), selector);
}

// Export now loads applyPageEdits on demand (DEBT-20 keeps pdf-lib off
// /redact/'s first paint), and a module load is not a fixed number of ticks:
// it takes more of them under a full-suite run than it does with this file
// alone, which is exactly how a counted tick goes green here and red in CI.
// So wait on the thing the test is really waiting for. The bound is time, not
// a count of ticks, for the same reason (DEBT-39: a counted bound ran out
// under a loaded machine), and it turns a genuine regression into a named
// failure well inside the test timeout rather than a hang.
export async function settleUntil(description: string, ready: () => boolean, budgetMs = 2000): Promise<void> {
  const deadline = performance.now() + budgetMs;
  while (!ready() && performance.now() < deadline) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  if (!ready()) throw new Error(`Timed out waiting for ${description}`);
}

// RED-30: drag the blur slider to `value` and release: input events paint live,
// the one change event commits.
export async function dragBlurSlider(value: number, steps: number[] = []): Promise<void> {
  const input = required(document.querySelector<HTMLInputElement>('[data-editor-blur-strength-input]'), 'blur slider');
  for (const step of [...steps, value]) {
    await act(async () => {
      input.value = String(step);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}

// EDGE 1 of 2: pdf.js cannot run its worker or paint in jsdom, so `pdfjs-dist` is faked by the harness
// (src/test/harness/pdfjsEdges.ts, steered through `harness.pdfjs`) and nowhere else. Everything above it
// (redactPdf and its flatten/assemble, the page-text and saved-file-check hooks, useDocumentDetails,
// removePlaces, draftStore, analytics, error reports, the gesture controller) runs for real. The fake pages
// carry what a test puts in `harness.pdfjs.pageItems` as their text, and read a document's info (Title,
// Author, ...) back from the very bytes they were handed, as pdf.js would.

// EDGE: jsdom has no canvas. The export paints a flattened page and encodes it with toDataURL; this
const JPEG_1X1_BASE64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
/** `encoded`: pages encoded to a JPEG. `fills`: every fillRect as `colour x,y,w,h`, in paint order. */
export const canvasEdge = { encoded: 0, fills: [] as string[] };
export function installCanvasEdge(): () => void {
  const { getContext, toDataURL } = HTMLCanvasElement.prototype;
  HTMLCanvasElement.prototype.getContext = function getContextStub() {
    const ctx: Record<string, unknown> = {
      fillStyle: '#000000',
      fillRect(x: number, y: number, w: number, h: number) { canvasEdge.fills.push(`${ctx.fillStyle} ${x},${y},${w},${h}`); },
      drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {}, stroke() {},
      measureText: (text: string) => ({ width: text.length * 6 }),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    };
    return ctx as unknown as CanvasRenderingContext2D;
  } as unknown as typeof getContext;
  HTMLCanvasElement.prototype.toDataURL = function toDataURLStub() {
    canvasEdge.encoded += 1;
    return `data:image/jpeg;base64,${JPEG_1X1_BASE64}`;
  };
  return () => { HTMLCanvasElement.prototype.getContext = getContext; HTMLCanvasElement.prototype.toDataURL = toDataURL; };
}


const pdfBytesCache = new Map<string, Uint8Array>();
export async function buildPdf(pages: number, info: { title?: string; author?: string } = {}): Promise<Uint8Array> {
  const key = `${pages}:${info.title ?? ''}:${info.author ?? ''}`;
  const cached = pdfBytesCache.get(key);
  if (cached) return cached;
  const doc = await PDFDocument.create({ updateMetadata: false });
  for (let i = 0; i < pages; i += 1) doc.addPage([612, 792]);
  if (info.title) doc.setTitle(info.title);
  if (info.author) doc.setAuthor(info.author);
  const bytes = await doc.save();
  pdfBytesCache.set(key, bytes);
  return bytes;
}
beforeAll(async () => { await buildPdf(2); await buildPdf(3); });

export function makePdfFile(name: string, bytes?: Uint8Array): File {
  return new File([(bytes ?? pdfBytesCache.get('2::')!) as BlobPart], name, { type: 'application/pdf' });
}





// EDGE 2 of 2: jsdom cannot read a canvas's pixels, so the ring sampler is steered per test
// (each test file's vi.mock of pageSampling reads this). Also the one pixel read the eyedropper and the
// saved-file check share.
// RED-51: jsdom cannot read a page, so the ring sampler is steered per test.
// The default is null (what jsdom gives today); the recorder is a plain
// function so vi.restoreAllMocks() in a file's afterEach cannot wipe it.
export const pageSampler = {
  impl: (() => null) as (canvas: HTMLCanvasElement | null | undefined, box: { left: number; top: number; width: number; height: number }) => string | null,
  calls: [] as Array<{ canvas: HTMLCanvasElement | null | undefined; box: { left: number; top: number; width: number; height: number } }>,
};

// RED-51: sets the selected box's colour through its toolbar's colour input.
export async function setSelectedBoxColor(color: string) {
  const input = query<HTMLInputElement>(document.body, '[data-editor-actions] input[type="color"]');
  await act(async () => {
    input.value = color;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/** The slice of the tool harness the suite setup touches; the test file passes the real one in. */
interface SuiteHarness {
  restore(): void;
  settle(): Promise<void>;
  flush(): Promise<unknown>;
  usageEvents(name?: string): Array<{ name: string; properties: Record<string, unknown> }>;
  pdfjs: { pageItems: { clear(): void }; holdNextDocumentRead(): any };
}

/** What the test file hands the suite: this folder may not import a tool, a core module or the harness folder. */
interface SuiteDeps<H extends SuiteHarness> {
  Tool: ComponentType;
  /** The tool's saved-file-check copy (CHECKING). */
  checking: string;
  /** The gesture module's namespace, whose startGesture the suite spies on. */
  gestureController: { startGesture: (options: any) => any };
  installToolHarness: (options?: { trackIndexedDb?: boolean }) => H;
  waitUntil: (condition: () => unknown) => Promise<unknown>;
}

/** Registers the suite's setup and teardown inside the calling describe and returns its shared state and helpers. */
export function useRedactSuite<H extends SuiteHarness>({ Tool, checking, gestureController, installToolHarness, waitUntil }: SuiteDeps<H>) {
  const s = {
    container: document.createElement('div'),
    harness: undefined as unknown as H,
    restoreCanvas: undefined as (() => void) | undefined,
    // One entry per gesture the tool started: its commit callback, wrapped, so a gesture that commits
    // twice is seen (the action trail drops a repeat of its last name, so it cannot count commits).
    gestureCommitSpies: [] as Array<ReturnType<typeof vi.fn>>,
  };
  beforeAll(async () => { await buildPdf(2); await buildPdf(3); });


  /** Holds the next pdf.js document read (see `s.harness.pdfjs.holdNextDocumentRead`); `runToEnd` lets the export finish. */
  function holdNextDocumentRead() {
    const held = s.harness.pdfjs.holdNextDocumentRead();
    return {
      ...held,
      /** Releases the read and lets the export run to its end, whatever the tool then does with the result. */
      async runToEnd() {
        held.release();
        await act(async () => { await held.finished; await new Promise((resolve) => setTimeout(resolve, 100)); });
      },
    };
  }
  // What the tool has told the usage endpoint so far, as [event, tool] in the order sent.
  const lifecycle = async () => { await s.harness.flush(); return s.harness.usageEvents().map((e) => [e.name, e.properties.tool]); };
  const failedOperations = async () => { await s.harness.flush(); return s.harness.usageEvents('tool_operation_failed'); };

  beforeEach(() => {
    s.harness = installToolHarness({ trackIndexedDb: true });
    s.gestureCommitSpies = [];
    const actualStartGesture = gestureController.startGesture;
    vi.spyOn(gestureController, 'startGesture').mockImplementation((options: any) => {
      const commit: any = vi.fn(options.commit);
      s.gestureCommitSpies.push(commit);
      return actualStartGesture({ ...options, commit });
    });
    canvasEdge.encoded = 0;
    canvasEdge.fills = [];
    s.harness.pdfjs.pageItems.clear();
    // jsdom's default answers every media query "yes". The editor tests mean a desktop with a
    // mouse, so the one query that says "finger" (useCoarsePointer) answers no.
    window.matchMedia = ((q: string) => ({
      matches: !q.includes('coarse'), media: q, addEventListener: () => {}, removeEventListener: () => {},
    })) as any;
  });

  afterEach(async () => {
    // A saved-file check still running after a download keeps reading through pdf.js; let it finish
    // here, or those reads take the next test's pdf.js fakes and its report lands in that test.
    if (s.container.isConnected) await waitUntil(() => !s.container.textContent.includes(checking));
    if (s.container.isConnected) {
      act(() => render(null, s.container));
      s.container.remove();
    }
    // The draft restore a mount starts reads IndexedDB and carries on afterwards (it clears the hand-off
    // marker on `document`). A short test ends before that read does; let it finish while jsdom is up,
    // or it lands after teardown as an unhandled `document is not defined` that fails the whole shard.
    await s.harness.settle();
    vi.restoreAllMocks();
    s.restoreCanvas?.();
    s.restoreCanvas = undefined;
    s.harness.restore();
    // A remembered blur strength or brush colour (rememberAppStyle) is on-device
    // state, so a test that sets one must not hand it to whichever test runs next.
    localStorage.clear();
  });

  return { s, holdNextDocumentRead, lifecycle, failedOperations, ...redactSuiteActions(s, { Tool, waitUntil }) };
}

interface SuiteState {
  container: HTMLElement;
  gestureCommitSpies: Array<ReturnType<typeof vi.fn>>;
}

/** The suite's load, arm and draw helpers, reading the live container from `s`. */
function redactSuiteActions(s: SuiteState, { Tool, waitUntil }: { Tool: ComponentType; waitUntil: (condition: () => unknown) => Promise<unknown> }) {
  async function loadFileAndGetDrawArea(file: File = makePdfFile('test_secret.pdf')): Promise<HTMLElement> {
    const drawArea = await loadFileWithoutArming(file);
    // Nothing is armed on load, and a tool arms for one box at a time, so every
    // caller here that wants drawBox() to actually draw needs Blackout armed
    // first. Centralized rather than repeated at the suite's many drawBox()
    // call sites, since none of them are testing which tool starts selected;
    // they test box drag/resize/delete mechanics and just need a box on the
    // page to exercise. Tests that draw twice have to arm twice - that is the
    // one-shot contract, and it has its own tests in PdfRedactTool.arming.test.tsx.
    await armTool('Blackout');
    return drawArea;
  }

  async function armTool(label: string, { lock = false }: { lock?: boolean } = {}): Promise<HTMLButtonElement> {
    const button = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
      .find((b) => b.textContent.includes(label)), `${label} tool button`);
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    });
    if (lock) {
      await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
      });
    }
    return button;
  }

  // Each dispatch is its own act() so the state update it triggers (e.g. setDrawingState
  // in handlePointerDown) flushes and re-renders before the next event is handled —
  // batching them in one act() left drawingState still null when handlePointerMove ran.
  async function drawBox(drawArea: HTMLElement, downX: number, downY: number, moveX: number, moveY: number): Promise<void> {
    await act(async () => {
      drawArea.dispatchEvent(new MouseEvent('mousedown', { clientX: downX, clientY: downY, bubbles: true }));
    });
    await act(async () => {
      drawArea.dispatchEvent(new MouseEvent('mousemove', { clientX: moveX, clientY: moveY, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });
  }

  // A gesture commits its state exactly once, on release (never one per pointer move).
  function expectLatestGestureToCommitOnce() {
    const commit = s.gestureCommitSpies.at(-1);
    if (!commit) throw new Error('no gesture was started');
    expect(commit).toHaveBeenCalledTimes(1);
  }

  // Same load as loadFileAndGetDrawArea, minus the trailing armTool('Blackout').
  // Most tests in this file want a box on the page and don't care which tool
  // starts selected, so loadFileAndGetDrawArea arms Blackout for them. The tests
  // below are specifically about the *resting* state before anything is armed
  // (nothing was ever true before E9's arming model - a style, 'delete', used to
  // be permanently selected from the moment a file loaded), so they need the
  // load without that convenience.
  async function loadFileWithoutArming(file: File = makePdfFile('unarmed.pdf')): Promise<HTMLElement> {
    s.container = document.createElement('div');
    document.body.appendChild(s.container);
    act(() => {
      render(<Tool />, s.container);
    });

    const input = query<HTMLInputElement>(s.container, 'input[type="file"]');
    await act(async () => {
      setInputFiles(input, [file]);
    });
    await waitUntil(() => query(s.container, '.redact-draw-area'));

    const drawArea = query<HTMLElement>(s.container, '.redact-draw-area');
    drawArea.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 500, height: 1000, right: 500, bottom: 1000, x: 0, y: 0, toJSON: () => {}
    });
    return drawArea;
  }

  function findToolButton(label: string): HTMLButtonElement {
    return required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
      .find((b) => b.textContent.includes(label)), `${label} tool button`);
  }


  // Opens a second file over the loaded one and confirms the replace dialog.
  async function openSecondFile(name: string): Promise<void> {
    const input = query<HTMLInputElement>(s.container, 'input[type="file"]');
    await act(async () => { setInputFiles(input, [makePdfFile(name)]); });
    const confirmReplace = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('dialog button'))
      .find((button) => button.textContent.trim() === 'Replace file'), 'Replace file button');
    await act(async () => { confirmReplace.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
  }

  return { loadFileAndGetDrawArea, armTool, drawBox, expectLatestGestureToCommitOnce, loadFileWithoutArming, findToolButton, openSecondFile };
}
