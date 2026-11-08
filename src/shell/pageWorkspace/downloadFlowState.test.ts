import { describe, expect, it } from 'vitest';
import { downloadFlowReducer, initialDownloadFlow, type DownloadFlowState } from './downloadFlowState.ts';

const run = (state: DownloadFlowState, ...events: Parameters<typeof downloadFlowReducer>[1][]) => events.reduce(downloadFlowReducer, state);
const waitingQuiet = run(initialDownloadFlow, { type: 'PREPARING_TAPPED', openStrip: true });

describe('downloadFlowReducer', () => {
  it('DOWNLOAD_TAPPED: processing, counted as downloaded, strip only when asked', () => {
    expect(run(initialDownloadFlow, { type: 'DOWNLOAD_TAPPED', openStrip: false })).toMatchObject({ tap: 'processing', downloadedOnce: true, stripOpen: false });
    expect(run(initialDownloadFlow, { type: 'DOWNLOAD_TAPPED', openStrip: true }).stripOpen).toBe(true);
  });
  it('DOWNLOAD_TAPPED keeps a tap that is waiting on the build', () => {
    const next = run(waitingQuiet, { type: 'DOWNLOAD_TAPPED', openStrip: false });
    expect(next).toMatchObject({ tap: 'processing', waiting: { openStrip: true } });
  });
  it('PREPARING_TAPPED: waits, remembering whether delivery opens the strip', () => {
    expect(run(initialDownloadFlow, { type: 'PREPARING_TAPPED', openStrip: false })).toMatchObject({ tap: 'processing', waiting: { openStrip: false }, downloadedOnce: false });
    expect(waitingQuiet).toMatchObject({ tap: 'processing', waiting: { openStrip: true } });
  });
  it('a later row tap replaces the quiet strip memory', () => {
    expect(run(waitingQuiet, { type: 'PREPARING_TAPPED', openStrip: false })).toMatchObject({ waiting: { openStrip: false } });
  });
  it('PART_SAVED and SHARED move to processing without counting a delivery', () => {
    expect(run(initialDownloadFlow, { type: 'PART_SAVED' })).toMatchObject({ tap: 'processing', downloadedOnce: false });
    expect(run(initialDownloadFlow, { type: 'SHARED' })).toMatchObject({ tap: 'processing', downloadedOnce: false });
  });
  it('SETTLED: processing with nothing waiting becomes done; a waiting tap does not', () => {
    expect(run(initialDownloadFlow, { type: 'PART_SAVED' }, { type: 'SETTLED' }).tap).toBe('done');
    expect(run(waitingQuiet, { type: 'SETTLED' })).toBe(waitingQuiet);
    expect(run(initialDownloadFlow, { type: 'SETTLED' })).toBe(initialDownloadFlow);
  });
  it('OUTPUT_DELIVERED: done, delivered, and the strip opens only for a quiet tap', () => {
    expect(run(waitingQuiet, { type: 'OUTPUT_DELIVERED' })).toEqual({ ...initialDownloadFlow, tap: 'done', downloadedOnce: true, stripOpen: true });
    const row = run(initialDownloadFlow, { type: 'PREPARING_TAPPED', openStrip: false }, { type: 'OUTPUT_DELIVERED' });
    expect(row).toMatchObject({ tap: 'done', downloadedOnce: true, stripOpen: false });
  });
  it('OUTPUT_STALE clears downloadedOnce and the failed hand-off, nothing else', () => {
    const state = run(initialDownloadFlow, { type: 'DOWNLOAD_TAPPED', openStrip: true }, { type: 'HANDOFF_FAILED' });
    expect(run(state, { type: 'OUTPUT_STALE' })).toMatchObject({ tap: 'processing', stripOpen: true, downloadedOnce: false, handoffFailed: false });
    expect(run(initialDownloadFlow, { type: 'OUTPUT_STALE' })).toBe(initialDownloadFlow);
  });
  it('a plan change while a tap waits keeps the tap waiting: staleness does not drop it', () => {
    expect(run(waitingQuiet, { type: 'OUTPUT_STALE' })).toBe(waitingQuiet);
  });
  it('HANDOFF_STARTED clears and HANDOFF_FAILED sets the failure', () => {
    const failed = run(initialDownloadFlow, { type: 'HANDOFF_FAILED' });
    expect(failed.handoffFailed).toBe(true);
    expect(run(failed, { type: 'HANDOFF_STARTED' }).handoffFailed).toBe(false);
  });
  it('STRIP_CLOSED closes the strip', () => {
    const open = run(initialDownloadFlow, { type: 'DOWNLOAD_TAPPED', openStrip: true });
    expect(run(open, { type: 'STRIP_CLOSED' }).stripOpen).toBe(false);
    expect(run(initialDownloadFlow, { type: 'STRIP_CLOSED' })).toBe(initialDownloadFlow);
  });
  it('RESET returns every field to idle, including a waiting tap and a failed hand-off (mid hand-off)', () => {
    const busy = run(waitingQuiet, { type: 'HANDOFF_FAILED' }, { type: 'DOWNLOAD_TAPPED', openStrip: true });
    expect(run(busy, { type: 'RESET' })).toEqual(initialDownloadFlow);
  });
});
