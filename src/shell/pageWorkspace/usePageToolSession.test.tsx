import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { PDFDocument } from '@cantoo/pdf-lib';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { recentActions, resetActionTrailForTests } from '#lib/telemetry/actionTrail.ts';
import { repairedPdfLoader } from './useOpenPageDocument.ts';
import { usePageToolSession, type PageToolSession } from './usePageToolSession.ts';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { drainPromises } from '../../test/support/drainPromises.ts';
import '../../test/support/realPdfjs.ts';

// The probe, the page loader, pdf.js and the draft store run for real: real PDFs, and the store on fake-indexeddb.

const messages = {
  announceNeedsPassword: 'needs password', announceRestricted: 'restricted', loaded: '{name} {count}', loadFailed: 'failed',
  undoneAnnouncement: 'undone', redoneAnnouncement: 'redone', allIncluded: 'all in', allSkipped: 'all out', inverted: 'swapped',
};
// A real three-page PDF, built once.
let threePages: Uint8Array;
const pdf = (name: string) => new File([threePages as BlobPart], name, { type: 'application/pdf' });

let host: HTMLDivElement;
let current: PageToolSession;
let announce: Mock<(text: string) => void>;
let onPick: Mock<() => void>;
let onRejected: Mock<(names: string[]) => void>;

function mount() {
  function Probe() {
    current = usePageToolSession({
      tool: 'split', loader: repairedPdfLoader, unlockKinds: ['needs-password', 'owner-restricted'],
      messages, announce, onPick, onRejected,
    });
    return null;
  }
  act(() => render(<Probe />, host));
}
const flush = () => act(async () => { await drainPromises(); });
async function openThree() {
  await act(async () => { current.handleFilesAdded([pdf('a.pdf')]); });
  await waitUntil(() => current.present.plan.length === 3);
  await flush();
}

beforeAll(async () => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 3; i += 1) doc.addPage([200, 200]);
  threePages = await doc.save();
});

beforeEach(() => {
  indexedDB = new IDBFactory();
  localStorage.clear();
  host = document.createElement('div');
  announce = vi.fn();
  onPick = vi.fn();
  onRejected = vi.fn();
  resetActionTrailForTests();
  document.documentElement.setAttribute('data-handoff-pending', '');
  mount();
});
afterEach(async () => {
  act(() => render(null, host));
  await waitUntil(() => !document.documentElement.hasAttribute('data-handoff-pending'));
});

describe('usePageToolSession', () => {
  it('a non-PDF is reported rejected and the first PDF opens', async () => {
    const first = pdf('a.pdf');
    await act(async () => { current.handleFilesAdded([new File(['x'], 'notes.txt', { type: 'text/plain' }), first, pdf('b.pdf')]); });
    await waitUntil(() => current.present.plan.length === 3);
    await flush();
    expect(onRejected).toHaveBeenCalledWith(['notes.txt']);
    expect(current.file).toBe(first);
    expect(onPick).toHaveBeenCalledWith(first);
    expect(current.present.plan).toHaveLength(3);
  });

  it('only non-PDFs open nothing', async () => {
    await act(async () => { current.handleFilesAdded([new File(['x'], 'notes.txt', { type: 'text/plain' })]); });
    await flush();
    expect(onRejected).toHaveBeenCalledWith(['notes.txt']);
    expect(current.file).toBeNull();
  });

  it('a bulk action that changes nothing records nothing and announces nothing', async () => {
    await openThree();
    announce.mockClear();
    resetActionTrailForTests();
    act(() => current.onIncludeAll());
    expect(current.canUndo).toBe(false);
    expect(announce).not.toHaveBeenCalled();
    expect(recentActions().some((a: string) => /select_pages/.test(a))).toBe(false);
  });

  it('a bulk action is one history step, recorded and announced', async () => {
    await openThree();
    announce.mockClear();
    act(() => current.onSkipAll());
    expect(current.present.plan.every((p) => p.skipped)).toBe(true);
    expect(current.canUndo).toBe(true);
    expect(announce).toHaveBeenCalledWith('all out');
    expect(recentActions().at(-1)).toMatch(/select_pages/);
    act(() => current.handleUndo());
    expect(current.canUndo).toBe(false);
  });
});
