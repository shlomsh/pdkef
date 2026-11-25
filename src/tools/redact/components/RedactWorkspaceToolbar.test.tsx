import { render } from 'preact';
import { useReducer } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { getPdfjs } from '#lib/pdf/loadPdfjs.js';
import { PDFJS_WASM_URL } from '#lib/pdf/pdfjsWasm.js';
import '../../../test/support/realPdfjs.ts';
import { buildPdf } from '../../../test/support/redactCheckPdfs.test-helper.ts';
import RedactWorkspaceToolbar from './RedactWorkspaceToolbar.tsx';
import brushStyles from './BrushControls.module.css';
import { resolveBrush } from './BrushControls.tsx';
import { initialRedactStateFromPreferences } from '../lib/initialRedactState.ts';
import type { RedactElement } from '../lib/redactElements.ts';
import { redactReducer, type RedactAction, type RedactState } from '../state/redactState.ts';
import useRedactEditor, { type RedactEditor } from '../hooks/useRedactEditor.ts';
import useRedactPages, { type RedactPages } from '../hooks/useRedactPages.ts';
import type { RedactFind } from '../hooks/useRedactFind.ts';
import type { RedactFinishState } from '../hooks/useRedactFinish.ts';
import type useRedactExport from '../hooks/useRedactExport.ts';
import type { FinishFacts } from '../lib/finishState.ts';
import { englishRedactMessages as t } from '../messages.ts';
import { onAction } from '#lib/telemetry/actionTrail.ts';
import { getAppStyle } from '#editor/workspace/preferenceStore.ts';

type Exp = ReturnType<typeof useRedactExport>;

const box = (id: string): RedactElement => ({ id, pageIndex: 0, type: 'blackout', left: 10, top: 10, width: 20, height: 20, color: '#000000' });
const facts = (over: Partial<FinishFacts> = {}): FinishFacts => ({
  phase: 'ready', progress: 0, fileName: 'out.pdf', pageCount: 2, picturePages: 1, boxCount: 1, deletionCount: 0, fileSize: null, ...over,
});

function makeExp(over: Record<string, unknown> = {}) {
  // Forced: the real hook reaches these states only through a real export, a share sheet and a hand-off that leaves the page; it runs in useRedactExport.test.tsx.
  return {
    canSharePdf: false, shareReady: false, handoffBusy: false,
    handleSavePdf: vi.fn(), handleSharePdf: vi.fn(), requestHandoff: vi.fn(),
    ...over,
  } as unknown as Exp & { handleSavePdf: ReturnType<typeof vi.fn>; handleSharePdf: ReturnType<typeof vi.fn>; requestHandoff: ReturnType<typeof vi.fn> };
}

function makeFinish(over: Record<string, unknown> = {}) {
  // forced: the finish hook owns a timer and Drive state; the toolbar reads only these fields
  return {
    drive: { available: false, state: 'idle', link: null, save: vi.fn() },
    finishFacts: facts(), showStrip: false, downloadConfirmed: false,
    closeStrip: vi.fn(), handleToolbarDownload: vi.fn(), downloaded: false,
    ...over,
  } as unknown as RedactFinishState & { closeStrip: ReturnType<typeof vi.fn>; handleToolbarDownload: ReturnType<typeof vi.fn> };
}

describe('RedactWorkspaceToolbar wiring', () => {
  let root: HTMLElement;
  let current: { state: RedactState; editor: RedactEditor; pages: RedactPages; dispatch: (action: RedactAction) => void };

  let task: PDFDocumentLoadingTask;
  let pdfDocument: PDFDocumentProxy;
  beforeAll(async () => {
    task = (await getPdfjs()).getDocument({ data: await buildPdf([{ lines: ['one'] }]), wasmUrl: PDFJS_WASM_URL });
    pdfDocument = await task.promise;
  });
  afterAll(async () => { await task.destroy(); });

  let heard: string[];
  let stopHearing: () => void;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    heard = [];
    stopHearing = onAction((name) => heard.push(name));
  });
  afterEach(() => {
    stopHearing();
    act(() => render(null, root));
    root.remove();
    // Forced: the other tests run with no matchMedia at all (the hover hints off), which setup.js's would turn on.
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  function mount({ elements = [], patch = (state) => state, exp = makeExp(), finish = makeFinish(), overrideFind, coarse = false }: {
    elements?: RedactElement[];
    patch?: (state: RedactState) => RedactState;
    exp?: Exp;
    finish?: RedactFinishState;
    overrideFind?: (real: RedactFind) => RedactFind;
    coarse?: boolean;
  } = {}) {
    if (coarse) {
      // Forced: touch is a media query that matches only 'coarse' (hover and fine must not match), and setup.js's matchMedia matches every query.
      window.matchMedia = ((query: string) => ({ matches: query.includes('coarse'), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia;
    }
    function Harness() {
      const [raw, dispatch] = useReducer(redactReducer, undefined, initialRedactStateFromPreferences);
      const state = patch(raw);
      const setAnnouncement = (message: string) => dispatch({ type: 'ANNOUNCED', message });
      const pages = useRedactPages({ state, dispatch });
      const editor = useRedactEditor({ state, dispatch, setAnnouncement, fileBytes: null, pages });
      current = { state, editor, pages, dispatch };
      return (
        <div ref={pages.workspaceRef}>
          <RedactWorkspaceToolbar
            state={state} dispatch={dispatch} setAnnouncement={setAnnouncement} pages={pages} arming={editor.arming}
            editing={editor.editing} findKit={overrideFind ? overrideFind(editor.findKit) : editor.findKit}
            exp={exp} finish={finish} rating={<span data-rating />}
          />
        </div>
      );
    }
    act(() => render(<Harness />, root));
    const base = initialRedactStateFromPreferences();
    act(() => {
      current.dispatch({
        type: 'FILE_INITIALIZED', file: new File([new Uint8Array(0)], 'doc.pdf', { type: 'application/pdf' }), restored: false, elements,
        past: [], carried: undefined, details: {}, brush: resolveBrush(undefined, getAppStyle()), activeColor: base.tool.activeColor,
        activeBlurStrength: base.tool.activeBlurStrength,
      });
      current.dispatch({ type: 'DOCUMENT_READY', pdfDocument, numPages: 1 });
      current.dispatch({ type: 'FILE_LOADED' });
    });
    return { exp, finish };
  }

  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector);
  const byTitle = (title: string) => q<HTMLButtonElement>(`[role="toolbar"] button[title="${title}"]`)!;
  const toolButton = (label: string) => Array.from(root.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button')).find((b) => b.textContent.includes(label))!;
  const chipButtons = () => Array.from(root.querySelectorAll<HTMLButtonElement>('[data-tool-status] button')).filter((b) => !b.hasAttribute('role'));
  const click = (el: Element, detail = 1) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail })); });
  const statusText = () => q('[data-tool-status]')!.textContent;
  const downloadButton = () => toolButton('Download');
  const shareButton = () => toolButton('Share');
  const clickAdd = (extra: Parameters<RedactEditor['editing']['commands']['add']>[1] extends infer O ? Partial<O> : never = {}) => act(() => {
    current.editor.editing.commands.add([box('added')], { type: 'ADD', description: 'Added a box', ...extra });
  });

  describe('status line', () => {
    it('says the finished save while the strip is closed, and nothing of it under the open strip', () => {
      mount({ finish: makeFinish({ finishFacts: facts({ phase: 'saved', fileName: 'kept.pdf' }) }) });
      expect(statusText()).toContain('kept.pdf');
      act(() => render(null, root));
      mount({ finish: makeFinish({ finishFacts: facts({ phase: 'saved', fileName: 'kept.pdf' }), showStrip: true }) });
      expect(statusText()).not.toContain('kept.pdf');
    });

    it('shows the welcome tip on a fresh document, and not on one that already has work', () => {
      mount();
      expect(statusText()).toContain('pick a tool');
      act(() => render(null, root));
      mount({ patch: (state) => ({ ...state, document: { ...state.document, showWelcomeTip: false } }) });
      expect(statusText()).not.toContain('pick a tool');
    });

    it('says the work is back for a restored document until the first edit', () => {
      mount({ patch: (state) => ({ ...state, document: { ...state.document, showWelcomeTip: false, restoredWithWork: true } }) });
      expect(statusText()).toContain('Your changes from last time are back');
    });
  });

  describe('tool set', () => {
    it('arms a tool from the button, announces it, locks it on double click, and is told about a brush', () => {
      mount({ patch: (state) => ({ ...state, tool: { ...state.tool, brush: { mode: 'brush', size: 12 } } }) });
      click(toolButton('Blackout'));
      expect(toolButton('Blackout').getAttribute('aria-pressed')).toBe('true');
      expect(current.state.view.announcement).toContain('Blackout');
      expect(q('[data-tool-status] [role="switch"]')).not.toBeNull();
      click(toolButton('Blackout'), 2);
      expect(toolButton('Blackout').hasAttribute('data-locked')).toBe(true);
      expect(q('[data-tool-status] [role="switch"]')!.getAttribute('aria-checked')).toBe('true');

      click(toolButton('Blur'));
      expect(toolButton('Blur').getAttribute('aria-pressed')).toBe('true');
      expect(q('[data-tool-status] [role="switch"]')).toBeNull();
    });
  });

  describe('full screen', () => {
    it('toggles through the page column and shows which way it is', () => {
      mount();
      expect(q('[role="toolbar"] button[title="Exit full screen"]')).toBeNull();
      click(byTitle('Full screen'));
      expect(current.state.view.isPseudoFullscreen).toBe(true);
      expect(q('[role="toolbar"] button[title="Exit full screen"]')).not.toBeNull();
      click(byTitle('Exit full screen'));
      expect(current.state.view.isPseudoFullscreen).toBe(false);
    });
  });

  describe('output', () => {
    it('Download runs the finish hook, and is disabled with nothing to save, while exporting', () => {
      const finish = makeFinish();
      mount({ finish });
      expect(downloadButton().disabled).toBe(true);
      act(() => render(null, root));
      mount({ finish, elements: [box('a')] });
      expect(downloadButton().disabled).toBe(false);
      click(downloadButton());
      expect(finish.handleToolbarDownload).toHaveBeenCalledTimes(1);
      act(() => render(null, root));
      mount({ finish, elements: [box('a')], patch: (state) => ({ ...state, document: { ...state.document, status: 'redacting' } }) });
      expect(downloadButton().disabled).toBe(true);
      expect(downloadButton().title).toBe('Download the redacted PDF');
    });

    it('offers Share only when the browser can, prepares first, then shares the prepared file', () => {
      const exp = makeExp();
      mount({ exp, elements: [box('a')] });
      expect(root.querySelector('[role="toolbar"] button[title^="Apply redactions"]')).toBeNull();
      act(() => render(null, root));

      const preparing = makeExp({ canSharePdf: true, shareReady: false });
      mount({ exp: preparing, elements: [box('a')] });
      expect(shareButton().title).toBe('Apply redactions and prepare the PDF for sharing');
      click(shareButton());
      expect(preparing.handleSavePdf).toHaveBeenCalledWith('share');
      expect(preparing.handleSharePdf).not.toHaveBeenCalled();
      act(() => render(null, root));

      const ready = makeExp({ canSharePdf: true, shareReady: true });
      mount({ exp: ready, elements: [box('a')] });
      expect(shareButton().title).toBe('Share the redacted PDF');
      click(shareButton());
      expect(ready.handleSharePdf).toHaveBeenCalledTimes(1);
      expect(ready.handleSavePdf).not.toHaveBeenCalled();
    });

    it('disables Share with nothing to save and while exporting', () => {
      mount({ exp: makeExp({ canSharePdf: true }) });
      expect(shareButton().disabled).toBe(true);
      expect(shareButton().title).toBe('Draw a box or delete something first');
      act(() => render(null, root));
      mount({ exp: makeExp({ canSharePdf: true }), elements: [box('a')], patch: (state) => ({ ...state, document: { ...state.document, status: 'redacting' } }) });
      expect(shareButton().disabled).toBe(true);
    });

    it('says Saved on the toolbar Download once the finish hook confirms it', () => {
      mount({ elements: [box('a')], finish: makeFinish({ downloadConfirmed: true }) });
      expect(downloadButton().getAttribute('aria-label')).toBe('Download');
      act(() => render(null, root));
      mount({ elements: [box('a')] });
      expect(downloadButton().hasAttribute('aria-label')).toBe(false);
    });

    it('hangs the Drive menu beside Download', () => {
      mount({ elements: [box('a')], finish: makeFinish({ drive: { available: true, state: 'idle', link: null, save: vi.fn() } }) });
      expect(q('[data-drive-arrow]')).not.toBeNull();
    });
  });

  describe('history and the undo chip', () => {
    it('Undo and Redo step the real history, each enabled only when it can', () => {
      mount();
      expect(byTitle('Undo').disabled).toBe(true);
      expect(byTitle('Redo').disabled).toBe(true);
      clickAdd();
      expect(current.state.edits.elements).toHaveLength(1);
      expect(byTitle('Undo').disabled).toBe(false);
      click(byTitle('Undo'));
      expect(current.state.edits.elements).toHaveLength(0);
      expect(byTitle('Redo').disabled).toBe(false);
      click(byTitle('Redo'));
      expect(current.state.edits.elements).toHaveLength(1);
    });

    it('shows the chip message and its Undo takes the edit back', () => {
      mount();
      clickAdd({ undoChip: true, chipMessage: 'Chip says hello' });
      expect(statusText()).toContain('Chip says hello');
      click(chipButtons().find((b) => b.textContent === 'Undo')!);
      expect(current.state.edits.elements).toHaveLength(0);
      expect(statusText()).not.toContain('Chip says hello');
    });

    it('runs the chip extra once, and spends the chip', () => {
      const onSelect = vi.fn();
      mount();
      clickAdd({ undoChip: true, undoExtra: { label: 'Every page', onSelect } });
      expect(chipButtons().map((b) => b.textContent)).toEqual(['Every page', 'Undo']);
      click(chipButtons()[0]);
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(current.state.edits.undoAction).toBeNull();
      expect(chipButtons()).toHaveLength(0);
    });
  });

  describe('Find', () => {
    const matchFor = (id: string) => ({ id, pageIndex: 0, boxes: [{ left: 1, top: 1, width: 5, height: 5 }] });
    const withMatches = (spies: { prev: () => void; next: () => void; redactMatches: (matches: unknown[]) => void }) => (real: RedactFind): RedactFind => {
      const current = matchFor('current');
      return {
        ...real,
        find: {
          ...real.find,
          summary: { open: 4, covered: 1, position: 2, total: 5, pages: 1, reading: null, failed: false, currentCovered: false },
          current, openMatches: [matchFor('one'), matchFor('two')], prev: spies.prev, next: spies.next,
        },
        redactMatches: spies.redactMatches,
      } as unknown as RedactFind;
    };
    const toggle = () => q<HTMLButtonElement>('[data-redact-find-toggle]')!;
    const input = () => q<HTMLInputElement>('[data-redact-find-input]')!;
    const segment = (label: string) => Array.from(root.querySelectorAll<HTMLButtonElement>('[data-redact-find-bar] [aria-label="Cover with"] button')).find((b) => b.textContent === label)!;

    it('opens and closes the row from the Find button, and says which it is', () => {
      mount();
      expect(q('[data-redact-find-bar]')).toBeNull();
      expect(toggle().getAttribute('aria-pressed')).toBe('false');
      click(toggle());
      expect(q('[data-redact-find-bar]')).not.toBeNull();
      expect(toggle().getAttribute('aria-pressed')).toBe('true');
      click(toggle());
      expect(q('[data-redact-find-bar]')).toBeNull();
    });

    it('closes from the row own close button', () => {
      mount();
      click(toggle());
      click(q('[data-redact-find-close]')!);
      expect(q('[data-redact-find-bar]')).toBeNull();
    });

    it('keeps the typed term, the chosen kind and the cover style in the real find state', () => {
      mount();
      click(toggle());
      expect(segment('Blackout').getAttribute('aria-pressed')).toBe('true');
      click(segment('Blur'));
      expect(current.editor.findKit.find.redactStyle).toBe('blur');
      expect(segment('Blur').getAttribute('aria-pressed')).toBe('true');

      act(() => { input().value = 'secret'; input().dispatchEvent(new Event('input', { bubbles: true })); });
      expect(current.editor.findKit.find.term).toBe('secret');
      expect(input().value).toBe('secret');

      act(() => current.editor.findKit.find.setPreset('email'));
      const chip = q('[data-redact-find-preset-chip]')!;
      expect(chip.textContent).toContain('Email addresses');
      click(chip.querySelector('button')!);
      expect(current.editor.findKit.find.preset).toBeNull();
      expect(q('[data-redact-find-preset-chip]')).toBeNull();
    });

    it('shows the summary, steps with Previous and Next, and covers this one or all open ones', () => {
      const spies = { prev: vi.fn(), next: vi.fn(), redactMatches: vi.fn() };
      mount({ overrideFind: withMatches(spies) });
      click(toggle());
      act(() => { input().value = 'x'; input().dispatchEvent(new Event('input', { bubbles: true })); });
      expect(q('[data-redact-find-status]')!.textContent).toBe('2 of 5, 1 covered');
      click(root.querySelector('[data-redact-find-bar] button[aria-label="Previous match"]')!);
      expect(spies.prev).toHaveBeenCalledTimes(1);
      expect(spies.next).not.toHaveBeenCalled();
      click(root.querySelector('[data-redact-find-bar] button[aria-label="Next match"]')!);
      expect(spies.next).toHaveBeenCalledTimes(1);
      click(q('[data-redact-find-this]')!);
      expect(spies.redactMatches).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'current' })]);
      click(q('[data-redact-find-all]')!);
      expect(spies.redactMatches).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'one' }), expect.objectContaining({ id: 'two' })]);
    });
  });

  describe('brush controls', () => {
    const brushRow = () => q('[data-brush-controls]');
    const brushState = (mode: 'box' | 'brush') => (state: RedactState): RedactState => ({ ...state, tool: { ...state.tool, brush: { mode, size: 20 } } });

    it('hangs the row for the armed tool, named for it, with the document brush', () => {
      mount({ coarse: true, patch: brushState('brush') });
      expect(brushRow()).toBeNull();
      click(toolButton('Blur'));
      expect(brushRow()!.getAttribute('aria-label')).toBe(t.shapeBlur);
      expect(brushRow()!.classList.contains(brushStyles.hung)).toBe(true);
      expect(brushRow()!.classList.contains(brushStyles.faded)).toBe(false);
      expect(q<HTMLButtonElement>('[role="radio"][aria-checked="true"]')!.textContent).toBe(t.modeBrush);
      expect(q<HTMLInputElement>('input[aria-label="Brush size"], input[type="range"]')!.value).toBe('20');
      click(toolButton('Whiteout'));
      expect(brushRow()!.getAttribute('aria-label')).toBe(t.shapeWhiteout);
    });

    it('fades once the page is pressed', () => {
      mount({ coarse: true });
      click(toolButton('Blur'));
      act(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
      expect(brushRow()!.classList.contains(brushStyles.faded)).toBe(true);
    });

    it('records a brush change, keeps it, and arming goes unchanged while the tool is already armed', () => {
      mount({ coarse: true });
      click(toolButton('Blur'));
      heard.length = 0;
      click(Array.from(root.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find((b) => b.textContent === t.modeBrush)!);
      expect(current.state.tool.brush.mode).toBe('brush');
      expect(current.state.tool.activeStyle).toBe('blur');
      expect(heard).toContain('change_setting');
    });

    it('a pick from a tool submenu arms that tool in the same step', () => {
      mount();
      click(toolButton('Blackout'));
      expect(current.state.tool.activeStyle).toBe('blackout');
      const wrapper = toolButton('Whiteout').parentElement!;
      act(() => { wrapper.dispatchEvent(new MouseEvent('mouseenter')); });
      const radio = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-brush-controls] [role="radio"]')).find((b) => b.textContent === t.modeBrush)!;
      click(radio);
      expect(current.state.tool.brush.mode).toBe('brush');
      expect(current.state.tool.activeStyle).toBe('whiteout');
    });

    it('whiteout brush colours: shows the current one, records a pick, remembers it', () => {
      mount({ coarse: true, patch: brushState('brush') });
      click(toolButton('Whiteout'));
      const swatch = (label: string) => root.querySelector<HTMLButtonElement>(`[data-brush-controls] button[aria-label="${label}"]`)!;
      expect(swatch(t.colourWhite).getAttribute('aria-pressed')).toBe('true');
      expect(swatch(t.colourLightBlue).getAttribute('aria-pressed')).toBe('false');
      heard.length = 0;
      click(swatch(t.colourLightBlue));
      expect(current.state.tool.activeColor).toBe('#dbeafe');
      expect(swatch(t.colourLightBlue).getAttribute('aria-pressed')).toBe('true');
      expect(heard).toContain('change_setting');
    });

    it('the eyedropper shows its state and toggles the brush target', () => {
      mount({ coarse: true, patch: brushState('brush') });
      click(toolButton('Whiteout'));
      const pipette = () => root.querySelector<HTMLButtonElement>(`[data-brush-controls] button[aria-label="${t.pickColour}"]`)!;
      expect(pipette().getAttribute('aria-pressed')).toBe('false');
      click(pipette());
      expect(current.state.tool.eyedropping).toBe('brush');
      expect(pipette().getAttribute('aria-pressed')).toBe('true');
    });

    it('a box eyedropper is not the brush one', () => {
      mount({ coarse: true, patch: (state) => ({ ...brushState('brush')(state), tool: { ...brushState('brush')(state).tool, eyedropping: 'box' } }) });
      click(toolButton('Whiteout'));
      expect(root.querySelector(`[data-brush-controls] button[aria-label="${t.pickColour}"]`)!.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('done strip', () => {
    const saved = () => makeFinish({ showStrip: true, finishFacts: facts({ phase: 'saved', fileName: 'strip.pdf', fileSize: 2048 }) });

    it('is absent until the finish hook shows it', () => {
      mount();
      expect(q('[data-redact-done-strip]')).toBeNull();
    });

    it('carries the saved facts, the rating slot, and closes through the finish hook', () => {
      const finish = saved();
      mount({ finish });
      const strip = q('[data-redact-done-strip]')!;
      expect(strip.textContent).toContain('strip.pdf');
      expect(strip.querySelector('[data-rating]')).not.toBeNull();
      click(strip.querySelector('button[aria-label="Close"]')!);
      expect(finish.closeStrip).toHaveBeenCalledTimes(1);
    });

    it('hands off to the chosen tool, through the export, and says when it is busy or failed', () => {
      const exp = makeExp();
      mount({ exp, finish: saved() });
      const handoff = (label: string) => Array.from(root.querySelectorAll<HTMLButtonElement>('[data-redact-done-strip] button')).find((b) => b.textContent.includes(label))!;
      expect(handoff('Compress it').disabled).toBe(false);
      expect(root.querySelector('[data-redact-done-strip]')!.textContent).not.toContain(t.handoffFailed);
      click(handoff('Compress it'));
      expect(exp.requestHandoff).toHaveBeenLastCalledWith('compress');
      click(handoff('Sign it'));
      expect(exp.requestHandoff).toHaveBeenLastCalledWith('sign');
      act(() => render(null, root));

      mount({
        exp: makeExp({ handoffBusy: true }), finish: saved(),
        patch: (state) => ({ ...state, finish: { ...state.finish, handoffFailed: true } }),
      });
      expect(handoff('Compress it').disabled).toBe(true);
      expect(root.querySelector('[data-redact-done-strip]')!.textContent).toContain(t.handoffFailed);
    });

    it('steps aside for a hung brush row', () => {
      mount({ coarse: true, finish: saved() });
      expect(q('[data-redact-done-strip]')).not.toBeNull();
      click(toolButton('Blur'));
      expect(q('[data-redact-done-strip]')).toBeNull();
    });
  });

  describe('Peek', () => {
    it('holds while pressed and lets go on release', () => {
      mount();
      const peek = q<HTMLButtonElement>('[data-redact-peek]')!;
      expect(peek.getAttribute('aria-pressed')).toBe('false');
      act(() => { peek.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true })); });
      expect(current.editor.arming.peekAll).toBe(true);
      expect(peek.getAttribute('aria-pressed')).toBe('true');
      act(() => { peek.dispatchEvent(new Event('pointerup', { bubbles: true })); });
      expect(current.editor.arming.peekAll).toBe(false);
    });
  });
});
