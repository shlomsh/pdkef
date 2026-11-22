import { render, type ComponentType } from 'preact';
import { act } from 'preact/test-utils';
import { expect, vi, afterEach, beforeAll, beforeEach } from 'vitest';
import { page } from 'vitest/browser';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { setInputFiles } from './setInputFiles.js';
import { drainPromises } from './drainPromises.ts';

export function required<T>(value: T | null | undefined, description: string) {
  if (value == null) throw new Error(`Expected ${description}`);
  return value;
}

export function query<T extends Element = HTMLElement>(root: ParentNode, selector: string) {
  return required(root.querySelector<T>(selector), selector);
}

export async function settleUntil(description: string, ready: () => boolean, budgetMs = 2000) {
  const deadline = performance.now() + budgetMs;
  while (!ready() && performance.now() < deadline) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  if (!ready()) throw new Error(`Timed out waiting for ${description}`);
}

export async function dragBlurSlider(value: number, steps: number[] = []) {
  const input = required(document.querySelector<HTMLInputElement>('[data-editor-blur-strength-input]'), 'blur slider');
  for (const step of [...steps, value]) {
    await act(async () => {
      input.value = String(step);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}

/** The frame the suite's coordinates are written in: x 0..500 and y 0..1000 across an element's real box. */
export const FRAME = { width: 500, height: 1000 };

/**
 * Where the point (x, y) of FRAME lands on `el`'s real on-screen box, as clientX/clientY in whole
 * pixels: a MouseEvent carries whole pixels in Chromium, so an expected position computed from these is exact.
 */
export function clientPoint(el: Element, x: number, y: number) {
  const rect = el.getBoundingClientRect();
  return { clientX: Math.round(rect.left + (x / FRAME.width) * rect.width), clientY: Math.round(rect.top + (y / FRAME.height) * rect.height) };
}

/** The centre of `el`'s real box in whole pixels, e.g. to press a resize handle where `nearestHandle` finds it. */
export function centerOf(el: Element) {
  const rect = el.getBoundingClientRect();
  return { clientX: Math.round(rect.left + rect.width / 2), clientY: Math.round(rect.top + rect.height / 2) };
}

/** Where a whole-pixel client point sits on `el`'s real box, in percent of its width and height. */
export function percentOn(el: Element, { clientX, clientY }: { clientX: number; clientY: number }) {
  const rect = el.getBoundingClientRect();
  return { x: ((clientX - rect.left) / rect.width) * 100, y: ((clientY - rect.top) / rect.height) * 100 };
}

const PAGE_SIZE: [number, number] = [612, 792];
const pdfBytesCache = new Map<string, Uint8Array>();

/**
 * A real PDF of `pages` US Letter pages. `text[i]` is drawn on page i, one line each from the top
 * (Helvetica 12pt, baseline 72pt from the top, 20pt apart), so pdf.js reads it back as real text items.
 */
export async function buildPdf(pages: number, info: { title?: string; author?: string } = {}, text: string[][] = []) {
  const key = JSON.stringify([pages, info.title ?? '', info.author ?? '', text]);
  const cached = pdfBytesCache.get(key);
  if (cached) return cached;
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = text.length > 0 ? await doc.embedFont(StandardFonts.Helvetica) : undefined;
  for (let i = 0; i < pages; i += 1) {
    const sheet = doc.addPage(PAGE_SIZE);
    (text[i] ?? []).forEach((line, n) => sheet.drawText(line, { x: 72, y: PAGE_SIZE[1] - 72 - n * 20, size: 12, font }));
  }
  if (info.title) doc.setTitle(info.title);
  if (info.author) doc.setAuthor(info.author);
  const bytes = await doc.save();
  pdfBytesCache.set(key, bytes);
  return bytes;
}
beforeAll(async () => { await buildPdf(2); await buildPdf(3); });

export function makePdfFile(name: string, bytes?: Uint8Array) {
  return new File([(bytes ?? pdfBytesCache.get(JSON.stringify([2, '', '', []])))! as BlobPart], name, { type: 'application/pdf' });
}

export async function setSelectedBoxColor(color: string) {
  const input = query<HTMLInputElement>(document.body, '[data-editor-actions] input[type="color"]');
  await act(async () => {
    input.value = color;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

interface SuiteHarness {
  restore(): Promise<void>;
  flush(): Promise<unknown>;
  usageEvents(name?: string): Array<{ name: string; properties: Record<string, unknown> }>;
}

type ExportFn = (...args: any[]) => Promise<any>;

interface SuiteDeps<H extends SuiteHarness> {
  Tool: ComponentType;
  /** The tool's saved-file-check copy (CHECKING). */
  checking: string;
  /**
   * `spy` is `startGesture` from a test file that has `vi.mock('#lib/gestures/controller.ts', { spy: true })`,
   * `real` the same function from `vi.importActual`: the suite wraps each gesture's commit to count it.
   */
  gestureEntry: { spy: (options: any) => any; real: (options: any) => any };
  installToolHarness: () => Promise<H>;
  waitUntil: (condition: () => unknown) => Promise<unknown>;
  /**
   * The export's entry, for `holdNextExport`: `spy` is `applyPageEdits` from a test file that has
   * `vi.mock('./lib/applyPageEdits.js', { spy: true })`, `real` the same function from `vi.importActual`.
   */
  exportEntry?: { spy: ExportFn; real: ExportFn };
}

export function useRedactSuite<H extends SuiteHarness>({ Tool, checking, gestureEntry, installToolHarness, waitUntil, exportEntry }: SuiteDeps<H>) {
  const s = {
    container: document.createElement('div'),
    harness: undefined as unknown as H,
    gestureCommitSpies: [] as Array<ReturnType<typeof vi.fn>>,
  };

  function holdNextExport() {
    const { spy, real } = required(exportEntry, 'exportEntry in useRedactSuite');
    const started = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();
    let reached = false;
    let result: Promise<unknown> | undefined;
    // forced: the export is held at its start, then runs for real.
    vi.mocked(spy).mockImplementationOnce(async (...args: unknown[]) => {
      reached = true;
      started.resolve();
      await gate.promise;
      result = real(...args);
      return result;
    });
    return {
      reached: () => reached,
      started: started.promise,
      release: () => gate.resolve(),
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
  const lifecycle = async () => { await s.harness.flush(); return s.harness.usageEvents().map((e) => [e.name, e.properties.tool]); };
  const failedOperations = async () => { await s.harness.flush(); return s.harness.usageEvents('tool_operation_failed'); };

  beforeEach(async () => {
    await page.viewport(1280, 800);
    s.harness = await installToolHarness();
    s.gestureCommitSpies = [];
    if (exportEntry) vi.mocked(exportEntry.spy).mockReset();
    vi.mocked(gestureEntry.spy).mockImplementation((options: any) => {
      const commit: any = vi.fn(options.commit);
      s.gestureCommitSpies.push(commit);
      return gestureEntry.real({ ...options, commit });
    });
  });

  afterEach(async () => {
    if (s.container.isConnected) await waitUntil(() => !s.container.textContent.includes(checking));
    if (s.container.isConnected) {
      act(() => render(null, s.container));
      s.container.remove();
    }
    vi.restoreAllMocks();
    await s.harness.restore();
    await page.viewport(414, 896);
  });

  return { s, holdNextExport, lifecycle, failedOperations, ...redactSuiteActions(s, { Tool, waitUntil }) };
}

interface SuiteState {
  container: HTMLElement;
  gestureCommitSpies: Array<ReturnType<typeof vi.fn>>;
}

function redactSuiteActions(s: SuiteState, { Tool, waitUntil }: { Tool: ComponentType; waitUntil: (condition: () => unknown) => Promise<unknown> }) {
  async function loadFileAndGetDrawArea(file: File = makePdfFile('test_secret.pdf')) {
    const drawArea = await loadFileWithoutArming(file);
    await armTool('Blackout');
    return drawArea;
  }

  async function hoverBrushTool(label: string) {
    const button = findToolButton(label);
    await act(async () => { button.parentElement!.dispatchEvent(new MouseEvent('mouseenter')); });
  }

  async function armTool(label: string, { lock = false }: { lock?: boolean } = {}) {
    const button = findToolButton(label);
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

  async function drawBox(drawArea: HTMLElement, downX: number, downY: number, moveX: number, moveY: number) {
    await act(async () => {
      drawArea.dispatchEvent(new MouseEvent('mousedown', { ...clientPoint(drawArea, downX, downY), bubbles: true }));
    });
    await act(async () => {
      drawArea.dispatchEvent(new MouseEvent('mousemove', { ...clientPoint(drawArea, moveX, moveY), bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });
  }

  function expectLatestGestureToCommitOnce() {
    const commit = s.gestureCommitSpies.at(-1);
    if (!commit) throw new Error('no gesture was started');
    expect(commit).toHaveBeenCalledTimes(1);
  }

  async function loadFileWithoutArming(file: File = makePdfFile('unarmed.pdf')) {
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
    return query<HTMLElement>(s.container, '.redact-draw-area');
  }

  function findToolButton(label: string) {
    return required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
      .find((b) => b.textContent.includes(label)), `${label} tool button`);
  }

  async function openSecondFile(name: string) {
    const input = query<HTMLInputElement>(s.container, 'input[type="file"]');
    await act(async () => { setInputFiles(input, [makePdfFile(name)]); });
    const confirmReplace = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('dialog button'))
      .find((button) => button.textContent.trim() === 'Replace file'), 'Replace file button');
    await act(async () => { confirmReplace.click(); });
    await waitUntil(() => s.container.textContent.includes(`Loaded PDF "${name}"`) && s.container.querySelector('.redact-draw-area') !== null);
  }

  return { loadFileAndGetDrawArea, armTool, hoverBrushTool, drawBox, expectLatestGestureToCommitOnce, loadFileWithoutArming, findToolButton, openSecondFile };
}
