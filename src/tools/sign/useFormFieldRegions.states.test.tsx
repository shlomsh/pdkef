import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormFieldRegions } from './useFormFieldRegions.ts';

/**
 * The four ways the detector can come back with nothing, which used to be one
 * indistinguishable silence (FORM-11): it never started, its own modules never
 * loaded, it ran and threw, or it ran and the document really has nothing in
 * it.
 *
 * Every one of them leaves the editor exactly as it was, which is right - the
 * person asked to open a PDF, not to run a detector. What was wrong is that
 * nobody, including us, could tell them apart afterwards: a renamed export
 * once made every document report zero fields through a green build, a shell
 * cached before a deploy does the same thing to a browser for as long as the
 * cache serves it, and the precondition bail does it with nothing thrown at
 * all.
 *
 * The modules arrive by dynamic import, so each case is set up by mocking one
 * of them and re-importing the hook, which is also the only way to prove the
 * "the detector never loaded" branch at all.
 */
describe('useFormFieldRegions detection state', () => {
  let container: HTMLDivElement;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    // The failure is meant to be loud in the console and nowhere else; this
    // keeps the suite's output readable without weakening that.
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    warn.mockRestore();
    vi.doUnmock('@cantoo/pdf-lib');
    vi.doUnmock('../../editor/adapters/pdf/formWidgets.js');
    vi.resetModules();
  });

  /** A pdf.js document whose pages carry no text - enough for the walk to run. */
  const pdfDocument = {
    getPage: async () => ({ getTextContent: async () => ({ items: [] }) }),
  } as never;

  async function detect(
    inputs: [ArrayBuffer | null, number, unknown] = [new ArrayBuffer(8), 1, pdfDocument],
  ): Promise<FormFieldRegions> {
    const { default: useFormFieldRegions } = await import('./useFormFieldRegions.ts');
    let latest!: FormFieldRegions;
    function Probe() {
      latest = useFormFieldRegions(inputs[0], inputs[1], inputs[2] as never);
      return null;
    }
    await act(async () => { render(<Probe />, container); });
    await vi.waitFor(() => expect(latest.detection).not.toBe('pending'), { timeout: 5000, interval: 10 });
    return latest;
  }

  // The state that was never a state: the effect's own precondition bail. It
  // throws nothing, logs nothing and reaches no catch, and it produces the
  // exact reported symptom - no outlines, no snapping, an editor that looks
  // like it read a form with nothing in it. It is reported only after a grace
  // period, because a load sets the bytes in one step and the pdf.js document
  // in a later one and being half-ready in between is normal.
  it('says detection never started, and which input was missing, when the effect bails', async () => {
    vi.resetModules();
    const regions = await detect([new ArrayBuffer(4_096), 3, null]);

    expect(regions.detection).toBe('not-started');
    expect(regions.detectionIssue).toContain('no pdf.js document');
    // A length is a number the file row already shows; the bytes themselves
    // never leave this module.
    expect(regions.detectionIssue).toContain('bytes=4096');
    expect(regions.detectionIssue).toContain('pages=3');
  });

  it('names an empty or detached buffer as such, rather than letting it look like an empty form', async () => {
    vi.resetModules();
    const regions = await detect([new ArrayBuffer(0), 3, pdfDocument]);

    expect(regions.detection).toBe('not-started');
    expect(regions.detectionIssue).toContain('0 bytes');
    expect(regions.detectionIssue).toContain('empty or detached');
  });

  // The blank editor before a file is chosen is not a bail, and saying so
  // would be reporting an empty page.
  it('claims nothing at all when nothing has been opened', async () => {
    vi.resetModules();
    const { default: useFormFieldRegions } = await import('./useFormFieldRegions.ts');
    let latest!: FormFieldRegions;
    function Probe() {
      latest = useFormFieldRegions(null, 0, null);
      return null;
    }
    await act(async () => { render(<Probe />, container); });
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect(latest.detection).toBe('pending');
    expect(warn).not.toHaveBeenCalled();
  });

  // The live report this branch was built for: the shell is served
  // cache-first and has no skipWaiting(), so a copy cached before a deploy
  // goes on asking for chunk names that deploy replaced. The import rejects,
  // and every document looks like a document with no fields - permanently,
  // and identically on every reload.
  it('says the detector never loaded when its own chunks fail to import', async () => {
    vi.resetModules();
    vi.doMock('../../editor/adapters/pdf/formWidgets.js', () => {
      throw new TypeError('Importing a module script failed.');
    });

    const regions = await detect();
    expect(regions.detection).toBe('unavailable');
    expect(regions.combs).toEqual([]);
    expect(regions.cells).toEqual([]);
    expect(String(warn.mock.calls[0][0])).toContain('stale cached copy');
  });

  it('says the walk failed when the detector loaded and then threw', async () => {
    vi.resetModules();
    vi.doMock('@cantoo/pdf-lib', () => ({
      PDFDocument: { load: async () => { throw new TypeError('p.findLast is not a function'); } },
    }));

    const regions = await detect();
    expect(regions.detection).toBe('failed');
    // The throw is kept for the caller to classify and sanitise, and for the
    // console. It is never rendered.
    expect(regions.detectionError).toBeInstanceOf(TypeError);
    expect(String(warn.mock.calls[0][0])).toContain('did not complete');
  });

  // An honest zero: the run finished, and this document has nothing in it the
  // detector recognises. No error is carried, because there was none.
  it('says the walk finished when it ran and found nothing', async () => {
    vi.resetModules();
    vi.doMock('@cantoo/pdf-lib', () => ({
      PDFDocument: { load: async () => ({ getPageCount: () => 0 }) },
    }));

    const regions = await detect();
    expect(regions.detection).toBe('done');
    expect(regions.detectionError).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });
});
