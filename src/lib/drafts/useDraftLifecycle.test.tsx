import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ report: vi.fn() }));
// The draft store's hint and change subscription, the arrival intent and the update holds all run for real.
vi.mock('../telemetry/errorReport.ts', () => ({ reportError: mocks.report }));

import { RESTORE_TIMEOUT_MS, useDraftRestore, useDraftSave, type DraftSave, type DraftSaveInput } from './useDraftLifecycle.ts';
import { clearCurrentEntry, setCurrentEntry, upsertIndexEntry } from './draftRecentIndex.ts';
import { DRAFT_CHANGE_PREFIX } from './draftChanges.ts';
import { flushBeforeUpdateReload, isExportInFlight, isUpdateHeld } from '../appUpdate/updateHolds.ts';

// The hint a tool page reads before paint: a pointer at an entry the recents index holds.
const seedHint = (tool: string) => {
  upsertIndexEntry({ id: `entry-${tool}`, tool, fileName: 'a.pdf', fileType: 'application/pdf', savedAt: Date.now(), hasWork: true } as never);
  setCurrentEntry(tool, `entry-${tool}`);
};
// Another tab's save, as the browser tells this one: a storage event on the advisory key.
const otherTabWrote = () => {
  window.dispatchEvent(new StorageEvent('storage', {
    key: `${DRAFT_CHANGE_PREFIX}sign`,
    newValue: JSON.stringify({ writerId: 'another-tab', revision: 7, kind: 'saved' }),
  }));
};

let host: HTMLDivElement;
const settle = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); };

describe('useDraftRestore', () => {
  let checking: boolean;
  let settled: boolean;
  function Probe(props: Parameters<typeof useDraftRestore>[0]) {
    ({ checking, settled } = useDraftRestore(props));
    return null;
  }
  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement('div');
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.setAttribute('data-draft-hint', '');
    for (const tool of ['sign', 'scan', 'merge']) seedHint(tool);
    mocks.report.mockClear();
  });
  afterEach(() => {
    render(null, host);
    vi.useRealTimers();
    document.documentElement.removeAttribute('data-draft-hint');
  });

  it('starts checking only with a hint, passes the arrival source, and keeps the hint after a restore', async () => {
    const run = vi.fn(async () => true);
    sessionStorage.setItem('pdkef:arrival:recent', 'sign'); // a recent tile asked for this tool
    act(() => { render(<Probe tool="sign" run={run} />, host); });
    expect(run).toHaveBeenCalledWith('recent', expect.any(Function));
    expect(sessionStorage.getItem('pdkef:arrival:recent')).toBeNull();
    await settle();
    expect(checking).toBe(false);
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(true);
  });

  it('clears the hint when nothing was restored', async () => {
    act(() => { render(<Probe tool="sign" run={async () => false} />, host); });
    await settle();
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(false);
  });

  it("'settled' clears the hint whatever the outcome", async () => {
    act(() => { render(<Probe tool="scan" clearHint="settled" run={async () => true} />, host); });
    await settle();
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(false);
  });

  it('releases the caller after the timeout, and a late restore still runs to the end', async () => {
    let finish!: (v: boolean) => void;
    const applied = vi.fn();
    const run = (_: unknown, isCancelled: () => boolean) => new Promise<boolean>((r) => { finish = r; }).then((v) => { if (!isCancelled()) applied(); return v; });
    act(() => { render(<Probe tool="sign" run={run} />, host); });
    expect(checking).toBe(true);
    act(() => { vi.advanceTimersByTime(RESTORE_TIMEOUT_MS); });
    expect(checking).toBe(false);
    finish(true);
    await settle();
    expect(applied).toHaveBeenCalledTimes(1);
  });

  it('reports a check that threw and settles', async () => {
    act(() => { render(<Probe tool="merge" run={async () => { throw new Error('idb'); }} />, host); });
    await settle();
    expect(mocks.report).toHaveBeenCalledWith('drafts', expect.any(Error), 'restore_draft');
    expect(checking).toBe(false);
  });

  it('without a hint it is never checking, but is not settled until the check ends', async () => {
    clearCurrentEntry('merge');
    let finish!: (v: boolean) => void;
    act(() => { render(<Probe tool="merge" run={() => new Promise<boolean>((r) => { finish = r; })} />, host); });
    expect(checking).toBe(false);
    expect(settled).toBe(false);
    finish(false);
    await settle();
    expect(settled).toBe(true);
  });

  it('does nothing and is not checking when disabled', () => {
    const run = vi.fn(async () => true);
    act(() => { render(<Probe tool="sign" enabled={false} run={run} />, host); });
    expect(run).not.toHaveBeenCalled();
    expect(checking).toBe(false);
    expect(settled).toBe(true);
  });
});

describe('useDraftSave', () => {
  let save: DraftSave;
  type Props = Partial<DraftSaveInput<string>> & { snapshot: readonly unknown[] };
  const write = vi.fn(async (_record: string, _isCurrent: () => boolean) => true);
  const build = vi.fn((): string | null => 'record');
  function Probe(props: Props) {
    save = useDraftSave<string>({ tool: 'sign', canSave: true, build, write, errorStep: 'autosave_draft', ...props });
    return null;
  }
  const show = (props: Props) => act(() => { render(<Probe {...props} />, host); });

  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement('div');
    write.mockReset().mockResolvedValue(true);
    build.mockReset().mockReturnValue('record');
    mocks.report.mockClear();
    localStorage.clear();
  });
  afterEach(() => {
    render(null, host);
    vi.useRealTimers();
  });

  it('debounces one write per snapshot and shows pending, then saved', async () => {
    show({ snapshot: ['a'] });
    expect(save.state).toBe('pending');
    act(() => { vi.advanceTimersByTime(699); });
    expect(write).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    await settle();
    expect(write).toHaveBeenCalledTimes(1);
    expect(save.state).toBe('saved');
    show({ snapshot: ['a'] });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('a completion for an older snapshot never paints the newer one', async () => {
    let release!: (v: boolean) => void;
    write.mockImplementationOnce(() => new Promise<boolean>((r) => { release = r; }));
    show({ snapshot: ['a'] });
    act(() => { vi.advanceTimersByTime(700); });
    await settle();
    show({ snapshot: ['b'] });
    release(true);
    await settle();
    expect(save.state).toBe('pending');
  });

  it('builds from the latest render when the write starts', async () => {
    build.mockImplementation(() => 'first');
    show({ snapshot: ['a'] });
    build.mockImplementation(() => 'second');
    act(() => { vi.advanceTimersByTime(700); });
    await settle();
    expect(write).toHaveBeenCalledWith('second', expect.any(Function));
  });

  it("write's isCurrent turns false once a newer snapshot arrives", async () => {
    let release!: (v: boolean) => void;
    let current!: () => boolean;
    write.mockImplementationOnce((_r: string, isCurrent: () => boolean) => { current = isCurrent; return new Promise<boolean>((r) => { release = r; }); });
    show({ snapshot: ['a'] });
    act(() => { vi.advanceTimersByTime(700); });
    await settle();
    expect(current()).toBe(true);
    show({ snapshot: ['b'] });
    expect(current()).toBe(false);
    release(true);
    await settle();
  });

  it('a failed or throwing write is an error that holds updates, and is reported', async () => {
    write.mockRejectedValueOnce(new Error('quota'));
    show({ snapshot: ['a'] });
    act(() => { vi.advanceTimersByTime(700); });
    await settle();
    expect(save.state).toBe('error');
    expect(mocks.report).toHaveBeenCalledWith('drafts', expect.any(Error), 'autosave_draft');
    // Held as 'open': a forced update overrides it, an export in flight it is not.
    expect(isUpdateHeld()).toBe(true);
    expect(isExportInFlight()).toBe(false);
  });

  it('nothing to build ends idle without writing', async () => {
    build.mockReturnValue(null);
    show({ snapshot: ['a'] });
    act(() => { vi.advanceTimersByTime(700); });
    await settle();
    expect(write).not.toHaveBeenCalled();
    expect(save.state).toBe('idle');
  });

  it('writes nothing while canSave is false', () => {
    show({ snapshot: ['a'], canSave: false });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(write).not.toHaveBeenCalled();
    expect(save.state).toBe('idle');
  });

  it('markSaved makes the current snapshot clean: idle, no write, and no flush', async () => {
    show({ snapshot: ['restored'] });
    act(() => { save.markSaved(); });
    show({ snapshot: ['restored'] });
    act(() => { vi.advanceTimersByTime(1000); window.dispatchEvent(new Event('pagehide')); });
    await settle();
    expect(write).not.toHaveBeenCalled();
    expect(save.state).toBe('idle');
  });

  it('flushes on pagehide and before an update reload, awaiting the write', async () => {
    show({ snapshot: ['a'] });
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    await settle();
    expect(write).toHaveBeenCalledTimes(1);
    show({ snapshot: ['b'] });
    await act(async () => { await flushBeforeUpdateReload(); });
    expect(write).toHaveBeenCalledTimes(2);
    expect(save.state).toBe('saved');
  });

  it('another tab writing shows a conflict that stays until the next save starts', async () => {
    show({ snapshot: ['a'], watchConflicts: true });
    act(() => { vi.advanceTimersByTime(700); });
    await settle();
    act(() => { otherTabWrote(); });
    expect(save.state).toBe('conflict');
    show({ snapshot: ['a'], watchConflicts: true });
    expect(save.state).toBe('conflict');
    show({ snapshot: ['b'], watchConflicts: true });
    expect(save.state).toBe('pending');
    act(() => { vi.advanceTimersByTime(700); });
    await settle();
    expect(save.state).toBe('saved');
  });

  it('an update reload also waits for work the tool queued outside write', async () => {
    let finish!: () => void;
    const drain = vi.fn(() => new Promise<void>((r) => { finish = r; }));
    show({ snapshot: ['a'], canSave: false, drain });
    let done = false;
    const reload = flushBeforeUpdateReload().then(() => { done = true; });
    await settle();
    expect(drain).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);
    finish();
    await act(async () => { await reload; });
    expect(done).toBe(true);
  });

  it('markSaved leaves a standing conflict in place', async () => {
    show({ snapshot: ['restored'], canSave: false, hasWork: true, watchConflicts: true });
    act(() => { otherTabWrote(); });
    expect(save.state).toBe('conflict');
    act(() => { save.markSaved(); });
    show({ snapshot: ['restored'], canSave: false, hasWork: true, watchConflicts: true });
    expect(save.state).toBe('conflict');
  });

  it('a conflict needs work on screen: hasWork, not canSave, decides', () => {
    show({ snapshot: ['a'], canSave: false, watchConflicts: true });
    act(() => { otherTabWrote(); });
    expect(save.state).toBe('idle');
    show({ snapshot: ['a'], canSave: false, hasWork: true, watchConflicts: true });
    act(() => { otherTabWrote(); });
    expect(save.state).toBe('conflict');
  });

  it('invalidate drops an in-flight completion', async () => {
    let release!: (v: boolean) => void;
    write.mockImplementationOnce(() => new Promise<boolean>((r) => { release = r; }));
    show({ snapshot: ['a'], canSave: true });
    act(() => { vi.advanceTimersByTime(700); });
    await settle();
    act(() => { save.invalidate(); });
    show({ snapshot: ['a'], canSave: false });
    release(true);
    await settle();
    expect(save.state).toBe('idle');
  });
});
