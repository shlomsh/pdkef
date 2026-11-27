// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { useRef } from 'preact/hooks';
import { useComparePreviews } from '../hooks/useComparePreviews.ts';
import { englishCompressMessages as t } from '../messages';
import { ANALYSIS_SHAPES, buildAnalysisPdf, type AnalysisShape } from '../../../test/support/analysisPdfFixtures.ts';
import { HeldFile } from '../../../test/support/heldFile.ts';
import { useCompressMachine } from '../state/useCompressMachine.ts';
import { compressImageToTarget } from './compressImage.js';
import { compressPdf, compressPdfToTarget } from './compress.js';
import { compressPdfImages, compressPdfImagesToTarget } from './compressImages.js';
import { createCompressCallbacks, superseded } from './compressCallbacks.ts';

vi.mock('./compressImage.js', { spy: true });
vi.mock('./compress.js', { spy: true });
vi.mock('./compressImages.js', { spy: true });

// oxlint-disable-next-line landmines/no-test-doubles -- Forced: the real compressor decodes the photo with createImageBitmap or a blob: Image, which jsdom lacks.
vi.mocked(compressImageToTarget).mockImplementation((async (file: File) => ({
  blob: new Blob([new Uint8Array(10)], { type: 'image/jpeg' }),
  metTarget: true,
  width: 4,
  height: 3,
  originalWidth: 8,
  originalHeight: 6,
  file,
})) as never);

// The real compare previews hook, so a landed result reaches the real previews.
function realCompare() {
  const host = document.createElement('div');
  mounted.push(host);
  const ref: { current: ReturnType<typeof useComparePreviews> | null } = { current: null };
  const Probe = () => {
    ref.current = useComparePreviews({ runTokenRef: useRef(0) });
    return null;
  };
  act(() => render(h(Probe, null), host));
  return ref;
}

function setup(fileName = 'photo.png', { gateOpen = true } = {}) {
  const file = new File([new Uint8Array(100)], fileName, { type: 'image/png' });
  const machine = realMachine();
  act(() => {
    machine.send({ type: 'fileAccepted' });
    if (gateOpen) machine.send({ type: 'gateOpened' });
  });
  const compare = realCompare();
  const setAnnouncement = vi.fn();
  const callbacks = createCompressCallbacks({
    t,
    machine,
    compare: compare.current!,
    currentFileRef: { current: file },
    optionsRef: { current: { level: 'medium', targetKB: 5, flatten: false } },
    setAnnouncement: setAnnouncement as never,
  });
  return { file, machine, compare, setAnnouncement, callbacks };
}

describe('superseded', () => {
  it('throws an abort so usePreparedOutput drops the run quietly', () => {
    expect(() => superseded()).toThrow();
    expect(() => superseded()).toThrow(expect.objectContaining({ name: 'AbortError' }));
  });
});

describe('createCompressCallbacks', () => {
  let createUrl: MockInstance<typeof URL.createObjectURL>;
  let revokeUrl: MockInstance<typeof URL.revokeObjectURL>;
  beforeEach(() => {
    // Spy-through: Node's real object URLs, only watched.
    createUrl = vi.spyOn(URL, 'createObjectURL');
    revokeUrl = vi.spyOn(URL, 'revokeObjectURL');
  });
  afterEach(() => {
    createUrl.mockRestore();
    revokeUrl.mockRestore();
  });

  it('build starts the machine and returns an image result with its meta', async () => {
    const { callbacks, machine } = setup();
    const progress = vi.fn();
    const built = await callbacks.build(new AbortController().signal, progress);
    expect(machine.read().runCount).toBe(1);
    expect(built.meta?.outputType).toBe('image/jpeg');
    expect(built.meta?.announcement).toBe(t.imageComplete);
    expect(built.meta?.dimensions).toEqual({ width: 4, height: 3, originalWidth: 8, originalHeight: 6 });
  });

  it('build is superseded while the gate is closed', async () => {
    const { callbacks, machine } = setup('photo.png', { gateOpen: false });
    expect(machine.read().runnable).toBe(false);
    await expect(callbacks.build(new AbortController().signal, vi.fn())).rejects.toThrow();
    expect(machine.read().runCount).toBe(0);
  });

  it('fail announces the image failure for an image file', () => {
    const { callbacks, setAnnouncement } = setup();
    callbacks.fail(new Error('boom'));
    expect(setAnnouncement).toHaveBeenCalledWith(t.imageFailed);
  });

  it('land tells the machine, announces, clears and opens the compare', async () => {
    const { callbacks, machine, compare, setAnnouncement, file } = setup();
    const built = await callbacks.build(new AbortController().signal, vi.fn());
    const blob = (built as { blob: Blob }).blob;
    // An earlier result is on screen and a Download tap is waiting for this one.
    await act(async () => compare.current!.open(file, new Blob(['old'], { type: 'image/jpeg' })));
    const previous = compare.current!.previews!.after;
    act(() => machine.send({ type: 'busyTapped' }));
    expect(machine.read().tapped).toBe(true);
    act(() => callbacks.land(built));
    expect(machine.read().tapped).toBe(false);
    expect(setAnnouncement).toHaveBeenCalledWith(t.imageComplete);
    expect(revokeUrl).toHaveBeenCalledWith(previous);
    expect(createUrl).toHaveBeenLastCalledWith(blob);
    expect(compare.current!.previews!.after).not.toBe(previous);
  });

  it('land skips the compare for a passthrough', () => {
    const { callbacks, compare, setAnnouncement } = setup();
    expect(createUrl).not.toHaveBeenCalled();
    act(() => callbacks.land({ blob: new Blob(), pageCount: 0, meta: { passthrough: true, announcement: 'x' } as never }));
    expect(setAnnouncement).toHaveBeenCalledWith('x');
    expect(createUrl).not.toHaveBeenCalled();
    expect(compare.current!.previews).toBeNull();
  });
});

const mounted: HTMLElement[] = [];
afterEach(() => {
  for (const host of mounted.splice(0)) act(() => render(null, host));
});

// The real machine hook, so a token bump reaches a build in flight.
function realMachine() {
  const host = document.createElement('div');
  mounted.push(host);
  const ref: { current: ReturnType<typeof useCompressMachine> | null } = { current: null };
  const Probe = () => {
    ref.current = useCompressMachine();
    return null;
  };
  act(() => render(h(Probe, null), host));
  return ref.current!;
}

type Shape = AnalysisShape | 'locked';

async function shapeBytes(shape: Shape): Promise<Uint8Array> {
  if (shape === 'locked') return new Uint8Array(await readFile(resolve(process.cwd(), 'src/lib/__fixtures__/encrypted/needs-password.pdf')));
  return buildAnalysisPdf(ANALYSIS_SHAPES[shape]);
}

async function pdfSetup(shape: Shape, name = 'doc.pdf') {
  const bytes = await shapeBytes(shape);
  const file = new HeldFile(bytes.slice(), name, { held: false });
  const machine = realMachine();
  act(() => {
    machine.send({ type: 'fileAccepted' });
    machine.send({ type: 'gateOpened' });
  });
  const compare = { clear: vi.fn(), open: vi.fn() };
  const setAnnouncement = vi.fn();
  const currentFileRef = { current: file };
  const optionsRef = { current: { level: 'medium', targetKB: 100, flatten: false } };
  const callbacks = createCompressCallbacks({
    t,
    machine,
    compare: compare as never,
    currentFileRef,
    optionsRef,
    setAnnouncement: setAnnouncement as never,
  });
  return { file, machine, compare, setAnnouncement, currentFileRef, optionsRef, callbacks };
}

const run = (callbacks: ReturnType<typeof createCompressCallbacks>, onProgress: (p: number) => void = () => {}) =>
  callbacks.build(new AbortController().signal, onProgress);

describe('createCompressCallbacks on real PDFs', () => {
  beforeEach(() => {
    for (const fn of [compressPdf, compressPdfToTarget, compressPdfImages, compressPdfImagesToTarget]) vi.mocked(fn).mockClear();
  });

  it('Balanced calls compressPdfImages with the medium level and never compressPdf', async () => {
    const { callbacks, file } = await pdfSetup('textOnly');
    await run(callbacks);
    expect(compressPdfImages).toHaveBeenCalledTimes(1);
    expect(compressPdfImages).toHaveBeenCalledWith(file, expect.objectContaining({ maxLongSidePx: 1600, quality: 0.6 }));
    expect(compressPdf).not.toHaveBeenCalled();
    expect(compressPdfToTarget).not.toHaveBeenCalled();
  });

  it('Exact size runs with the 100 KB default, a preset runs again, and the page-rendering engine is never touched', async () => {
    const { callbacks, file, optionsRef } = await pdfSetup('textOnly');
    optionsRef.current = { level: 'target', targetKB: 100, flatten: false };
    await run(callbacks);
    expect(compressPdfImagesToTarget).toHaveBeenCalledTimes(1);
    expect(compressPdfImagesToTarget).toHaveBeenLastCalledWith(file, expect.objectContaining({ targetKB: 100 }));
    optionsRef.current = { level: 'target', targetKB: 500, flatten: false };
    await run(callbacks);
    expect(compressPdfImagesToTarget).toHaveBeenCalledTimes(2);
    expect(compressPdfImagesToTarget).toHaveBeenLastCalledWith(file, expect.objectContaining({ targetKB: 500 }));
    expect(compressPdfImages).not.toHaveBeenCalled();
    expect(compressPdf).not.toHaveBeenCalled();
    expect(compressPdfToTarget).not.toHaveBeenCalled();
  });

  it('ticking the switch calls compressPdf and not compressPdfImages again', async () => {
    const { callbacks, file, optionsRef } = await pdfSetup('textOnly');
    await run(callbacks);
    expect(compressPdfImages).toHaveBeenCalledTimes(1);
    optionsRef.current = { level: 'medium', targetKB: 100, flatten: true };
    file.hold();
    void run(callbacks);
    await file.started;
    expect(compressPdf).toHaveBeenCalledTimes(1);
    expect(vi.mocked(compressPdf).mock.calls[0][0]).toBe(file);
    expect(vi.mocked(compressPdf).mock.calls[0][1]).toEqual(expect.objectContaining({ level: 'medium' }));
    expect(compressPdfImages).toHaveBeenCalledTimes(1);
  });

  it('raises one buildStarted per started build', async () => {
    const { callbacks, machine } = await pdfSetup('textOnly');
    await run(callbacks);
    expect(machine.read().runCount).toBe(1);
    await run(callbacks);
    expect(machine.read().runCount).toBe(2);
  });

  it('a stale run reporting progress after a level change does not move the shown percentage', async () => {
    const { callbacks, machine } = await pdfSetup('textOnly');
    const shown: number[] = [];
    await run(callbacks, (p) => shown.push(p));
    const staleProgress = vi.mocked(compressPdfImages).mock.calls[0][1].onProgress as (p: number) => void;
    staleProgress(0.4);
    expect(shown).toEqual([0.4]);
    machine.send({ type: 'optionChanged' });
    staleProgress(0.8);
    expect(shown).toEqual([0.4]);
  });

  it('a level change during a run drops that run\'s result, and only the latest level builds after it', async () => {
    const { callbacks, machine, optionsRef } = await pdfSetup('textOnly');
    // The token is read before the build's first await, so a change sent right after the call lands in flight.
    const first = run(callbacks);
    machine.send({ type: 'optionChanged' });
    optionsRef.current = { level: 'low', targetKB: 100, flatten: false };
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const latest = await run(callbacks);
    expect(latest.meta?.passthrough).toBe(true);
    expect(compressPdfImages).toHaveBeenCalledTimes(2);
    expect(vi.mocked(compressPdfImages).mock.calls[1][1]).toEqual(expect.objectContaining({ maxLongSidePx: 2400, quality: 0.8 }));
  });

  it('does not land a stale compress result when the file is replaced mid-run', async () => {
    const { callbacks, machine, currentFileRef, setAnnouncement } = await pdfSetup('textOnly', 'run_a.pdf');
    const first = run(callbacks);
    const replacement = new HeldFile((await buildAnalysisPdf(ANALYSIS_SHAPES.single)).slice(), 'run_b.pdf', { held: false });
    currentFileRef.current = replacement;
    act(() => {
      machine.send({ type: 'fileAccepted' });
      machine.send({ type: 'gateOpened' });
    });
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const second = await run(callbacks);
    expect(vi.mocked(compressPdfImages).mock.calls[1][0]).toBe(replacement);
    expect(second.meta?.filename).toBe('run_b-compressed.pdf');
    expect(setAnnouncement).not.toHaveBeenCalled();
  });

  it('a build aborted by its signal lands nothing', async () => {
    const { callbacks } = await pdfSetup('textOnly');
    const controller = new AbortController();
    const pending = callbacks.build(controller.signal, () => {});
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  describe.each([
    ['no-images', 'textOnly', t.alreadySmallComplete],
    ['encrypted', 'locked', t.lockedTitle],
    ['unsupported', 'pictures', t.unsupportedTitle],
  ] as const)('reason %s', (reason, shape, announced) => {
    it('hands the input back unchanged with the reason, and the live region hears the announcement', async () => {
      const { callbacks, file, setAnnouncement } = await pdfSetup(shape);
      const built = await run(callbacks);
      expect(built.meta?.imageReason).toBe(reason);
      expect('blob' in built && built.blob).toBe(file);
      expect(built.meta?.passthrough).toBe(true);
      expect(built.meta?.unchanged).toBe(true);
      callbacks.land(built);
      expect(setAnnouncement).toHaveBeenCalledWith(announced);
    });
  });
});
