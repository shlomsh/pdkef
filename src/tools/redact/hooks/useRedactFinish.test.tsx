import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useRedactFinish, { type RedactFinishState } from './useRedactFinish.ts';
import { initialRedactStateFromPreferences } from '../lib/initialRedactState.ts';
import { redactReducer, type RedactAction, type RedactState } from '../state/redactState.ts';
import type { RedactElement } from '../lib/redactElements.ts';
import { DRIVE_TOKEN_KEY } from '#lib/handoff/driveSaveLink.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { sendToSink } from '#lib/telemetry/analyticsSink.ts';
import { setReportingEnabledForTests } from '#lib/telemetry/errorReport.ts';
import { resetUsageEventsForTests } from '#lib/telemetry/productAnalytics.ts';

vi.mock('#lib/telemetry/analyticsSink.ts', { spy: true });

const box = (id: string, pageIndex: number): RedactElement => ({ id, pageIndex, type: 'blackout', left: 10, top: 10, width: 20, height: 20, color: '#000000' });
const deletion = (id: string, pageIndex: number): RedactElement => (
  { id, pageIndex, type: 'delete', left: 10, top: 10, width: 20, height: 20 } as unknown as RedactElement
);

function stateWith(elements: RedactElement[], patch: (state: RedactState) => RedactState = (state) => state): RedactState {
  const base = initialRedactStateFromPreferences();
  const withFile = redactReducer(base, {
    type: 'FILE_INITIALIZED', file: new File([new Uint8Array(0)], 'doc.pdf', { type: 'application/pdf' }), restored: false,
    elements, past: [], carried: undefined, details: {}, brush: base.tool.brush, activeColor: base.tool.activeColor,
    activeBlurStrength: base.tool.activeBlurStrength,
  } as RedactAction);
  return patch(redactReducer(redactReducer(withFile, { type: 'DOCUMENT_READY', pdfDocument: null as never, numPages: 3 }), { type: 'FILE_LOADED' }));
}

describe('useRedactFinish', () => {
  let root: HTMLElement;
  let latest: RedactFinishState;
  const handleDownloadPdf = vi.fn();
  const buildForDrive = vi.fn<() => Promise<null>>();

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    handleDownloadPdf.mockClear();
    buildForDrive.mockClear();
  });
  afterEach(() => {
    act(() => render(null, root));
    root.remove();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  function mount(state: RedactState, outputFileName = 'redacted_doc.pdf') {
    function Probe({ current }: { current: RedactState }) {
      latest = useRedactFinish({ state: current, handleDownloadPdf, buildForDrive, outputFileName });
      return null;
    }
    const show = (current: RedactState) => act(() => render(<Probe current={current} />, root));
    show(state);
    return show;
  }

  it('counts boxes apart from deletions, and the pages that become pictures', () => {
    mount(stateWith([box('a', 0), box('b', 0), box('c', 2), deletion('d', 1), deletion('e', 1)]));
    expect(latest.finishFacts).toMatchObject({ boxCount: 3, deletionCount: 2, picturePages: 2, pageCount: 3 });
  });

  it('names the output file while a file is open, and nothing before one', () => {
    mount(stateWith([]));
    expect(latest.finishFacts.fileName).toBe('redacted_doc.pdf');
    mount(initialRedactStateFromPreferences());
    expect(latest.finishFacts.fileName).toBe('');
  });

  it('reads the phase, progress, saved name and size from state', () => {
    const blob = new Blob([new Uint8Array(1234)]);
    mount(stateWith([box('a', 0)], (state) => ({
      ...state,
      document: { ...state.document, progress: 0.5 },
      finish: { ...state.finish, exportedForHandoff: { blob, name: 'saved_as.pdf' } },
    })));
    expect(latest.finishFacts).toMatchObject({ phase: 'saved', progress: 0.5, fileName: 'saved_as.pdf', fileSize: 1234 });
  });

  it('has no file size before a save, and is ready with a box and empty without one', () => {
    mount(stateWith([box('a', 0)]));
    expect(latest.finishFacts).toMatchObject({ phase: 'ready', fileSize: null });
    mount(stateWith([]));
    expect(latest.finishFacts.phase).toBe('empty');
  });

  it('shows no strip until the toolbar Download, then confirms it once the save lands, and closes on request', () => {
    const element = box('a', 0);
    const saved = (state: RedactState): RedactState => ({ ...state, finish: { ...state.finish, exportedForHandoff: { blob: new Blob(['x']), name: 'out.pdf' } } });
    const show = mount(stateWith([element]));
    expect(latest.showStrip).toBe(false);
    expect(latest.downloadConfirmed).toBe(false);

    act(() => latest.handleToolbarDownload());
    expect(handleDownloadPdf).toHaveBeenCalledTimes(1);
    expect(latest.showStrip).toBe(false);

    show(stateWith([element], saved));
    expect(latest.showStrip).toBe(true);
    expect(latest.downloadConfirmed).toBe(true);

    show(stateWith([element], (state) => ({ ...saved(state), document: { ...state.document, status: 'redacting' } })));
    expect(latest.finishFacts.phase).toBe('exporting');
    expect(latest.showStrip).toBe(true);

    show(stateWith([element], saved));
    act(() => latest.closeStrip());
    expect(latest.showStrip).toBe(false);
  });

  it('learns of a download or a share, for the rating ask', () => {
    mount(stateWith([box('a', 0)]));
    expect(latest.downloaded).toBe(false);
    act(() => recordAction('download'));
    expect(latest.downloaded).toBe(true);
  });

  describe('Save to Drive', () => {
    beforeEach(() => {
      localStorage.setItem(DRIVE_TOKEN_KEY, JSON.stringify({ token: 'test-token' }));
      // forced: Save to Drive is offered on a desktop pointer only, and jsdom has no matchMedia
      window.matchMedia = ((query: string) => ({ matches: query.includes('hover: hover'), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia;
    });
    afterEach(() => {
      delete (window as { matchMedia?: unknown }).matchMedia;
      Reflect.deleteProperty(navigator, 'sendBeacon');
      setReportingEnabledForTests(false);
    });

    it('is offered once there is something to save and not while exporting', () => {
      mount(stateWith([]));
      expect(latest.drive.available).toBe(false);
      mount(stateWith([box('a', 0)]));
      expect(latest.drive.available).toBe(true);
      mount(stateWith([box('a', 0)], (state) => ({ ...state, document: { ...state.document, status: 'redacting' } })));
      expect(latest.drive.available).toBe(false);
    });

    it('reports its offer as Redact\'s', () => {
      // forced: jsdom has no beacon, and an event is only counted as sent once the beacon takes it
      Object.defineProperty(navigator, 'sendBeacon', { value: () => true, configurable: true, writable: true });
      setReportingEnabledForTests(true);
      resetUsageEventsForTests();
      vi.mocked(sendToSink).mockClear();
      mount(stateWith([box('a', 0)]));
      const events = vi.mocked(sendToSink).mock.calls.map(([event]) => event as unknown as { name: string; properties: { tool: string } });
      expect(events.filter((event) => event.name === 'tool_drive_shown').map((event) => event.properties.tool)).toEqual(['redact']);
    });

    it('builds the file it saves from the island export, and starts over when the document changes', async () => {
      // forced: the Drive tab opens in a new window, which jsdom cannot
      const opened = vi.spyOn(window, 'open').mockReturnValue({ closed: false } as Window);
      const show = mount(stateWith([box('a', 0)]));
      await act(async () => { latest.drive.save(); });
      expect(opened).toHaveBeenCalledTimes(1);
      expect(buildForDrive).toHaveBeenCalledTimes(1);
      expect(latest.drive.state).toBe('failed');

      show(stateWith([box('a', 0), box('b', 1)], (state) => ({ ...state, edits: { ...state.edits, documentRevision: state.edits.documentRevision + 1 } })));
      expect(latest.drive.state).toBe('idle');
    });
  });
});
