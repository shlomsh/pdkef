import { describe, expect, it } from 'vitest';
import { initialCompressState, isCurrentAnalysis, isCurrentRun, transition, type CompressEvent, type CompressState } from './compressMachine.ts';

const run = (events: CompressEvent['type'][], from: CompressState = initialCompressState) =>
  events.reduce((s, type) => transition(s, { type } as CompressEvent), from);

describe('compressMachine', () => {
  it('starts closed and idle', () => {
    expect(initialCompressState).toEqual({ runnable: false, runToken: 0, analysisToken: 0, runCount: 0, tapped: false, retryTap: 'idle' });
  });

  it('fileAccepted closes the gate, bumps both tokens and resets the taps', () => {
    const open = run(['gateOpened', 'busyTapped', 'retryTapped']);
    const next = transition(open, { type: 'fileAccepted' });
    expect(next).toMatchObject({ runnable: false, runToken: 1, analysisToken: 1, tapped: false, retryTap: 'idle' });
  });

  it('gateOpened opens the gate and is a no-op when already open', () => {
    const open = transition(initialCompressState, { type: 'gateOpened' });
    expect(open.runnable).toBe(true);
    expect(transition(open, { type: 'gateOpened' })).toBe(open);
  });

  it('optionChanged bumps the run token (not the analysis token) and resets the taps', () => {
    const s = run(['gateOpened', 'busyTapped']);
    const next = transition(s, { type: 'optionChanged' });
    expect(next).toMatchObject({ runnable: true, runToken: 1, analysisToken: 0, tapped: false, retryTap: 'idle' });
  });

  it('buildFailed bumps the run token and resets the taps', () => {
    const s = run(['retryTapped']);
    expect(transition(s, { type: 'buildFailed' })).toMatchObject({ runToken: 1, tapped: false, retryTap: 'idle' });
  });

  it('buildStarted counts runs and keeps everything else', () => {
    const s = run(['gateOpened', 'buildStarted', 'buildStarted']);
    expect(s).toMatchObject({ runCount: 2, runnable: true, runToken: 0 });
  });

  it('buildLanded clears tapped only, and is a no-op when not tapped', () => {
    const tapped = transition(initialCompressState, { type: 'busyTapped' });
    expect(transition(tapped, { type: 'buildLanded' }).tapped).toBe(false);
    expect(transition(initialCompressState, { type: 'buildLanded' })).toBe(initialCompressState);
    expect(transition({ ...tapped, retryTap: 'processing' }, { type: 'buildLanded' }).retryTap).toBe('processing');
  });

  it('retryTapped then retrySettled walks idle, processing, done', () => {
    const processing = transition(initialCompressState, { type: 'retryTapped' });
    expect(processing).toMatchObject({ retryTap: 'processing', tapped: true });
    expect(transition(processing, { type: 'retrySettled' }).retryTap).toBe('done');
  });

  it('busyTapped sets tapped and is a no-op when already set', () => {
    const s = transition(initialCompressState, { type: 'busyTapped' });
    expect(s.tapped).toBe(true);
    expect(transition(s, { type: 'busyTapped' })).toBe(s);
  });

  describe('reselecting the target size', () => {
    it('while a build runs: the in-flight run goes stale and a second build is current', () => {
      let s = run(['gateOpened', 'buildStarted']);
      const inFlight = s.runToken;
      s = transition(s, { type: 'optionChanged' });
      expect(isCurrentRun(s, inFlight)).toBe(false);
      s = transition(s, { type: 'buildStarted' });
      expect(isCurrentRun(s, s.runToken)).toBe(true);
      expect(s.runCount).toBe(2);
    });

    it('after it landed: the taps start over and the gate stays open', () => {
      const s = run(['gateOpened', 'buildStarted', 'busyTapped', 'buildLanded', 'optionChanged']);
      expect(s).toMatchObject({ runnable: true, tapped: false, retryTap: 'idle', runToken: 1 });
    });
  });

  describe('stale tokens', () => {
    it('a run captured before a new file, an option change or a failure is no longer current', () => {
      for (const type of ['fileAccepted', 'optionChanged', 'buildFailed'] as const) {
        const s = run(['gateOpened']);
        const token = s.runToken;
        expect(isCurrentRun(s, token)).toBe(true);
        expect(isCurrentRun(transition(s, { type }), token)).toBe(false);
      }
    });

    it('an analysis is stale only after a new file', () => {
      const s = initialCompressState;
      expect(isCurrentAnalysis(s, s.analysisToken)).toBe(true);
      expect(isCurrentAnalysis(transition(s, { type: 'optionChanged' }), s.analysisToken)).toBe(true);
      expect(isCurrentAnalysis(transition(s, { type: 'fileAccepted' }), s.analysisToken)).toBe(false);
    });
  });
});
