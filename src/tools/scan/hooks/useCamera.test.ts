import { describe, expect, it, vi } from 'vitest';
import { INITIAL_CAPTURE_STATE, markTaken } from '../lib/capture/captureMachine.ts';
import type { CaptureState, FrameObservation } from '../lib/capture/types.ts';
import { WHOLE_FRAME } from '../lib/camera/viewfinderModel.ts';
import { attemptShot, restoreUntaken } from './useCamera.ts';

vi.mock('#lib/telemetry/errorReport.ts', () => ({ reportError: vi.fn() }));

const HASH = '0f0f0f0f0f0f0f0f';
const obs = { t: 1, quad: null, confidence: 0, sharpness: 0, area: 0, hash: HASH, focus: 0 } as FrameObservation;
const setup = (state: CaptureState) => ({
  stateRef: { current: state },
  keptRef: { current: [] as string[] },
  lastObs: { current: obs },
  lastView: { current: WHOLE_FRAME },
  pending: { current: null as string | null },
  shotHashes: new WeakMap<File, string>(),
  onTaken: vi.fn(),
});

describe('attemptShot', () => {
  it('a shutter shot that fails leaves its page untaken and on offer', async () => {
    const s = setup(INITIAL_CAPTURE_STATE);
    await attemptShot({ ...s, byShutter: true, capture: () => Promise.reject(new Error('no photo')) });
    expect(s.stateRef.current.takenHashes).toEqual([]);
    expect(s.stateRef.current.lastCaptureHash).toBeNull();
    expect(s.onTaken).not.toHaveBeenCalled();
  });

  it('an auto shot that fails forgets the page the machine fired on', async () => {
    const s = setup(markTaken(INITIAL_CAPTURE_STATE, HASH));
    await attemptShot({ ...s, quad: null, byShutter: false, capture: () => Promise.reject(new Error('no photo')) });
    expect(s.stateRef.current.takenHashes).toEqual([]);
    expect(s.stateRef.current.phase).toBe('searching');
  });

  it('a shot that works keeps the page remembered', async () => {
    const s = setup(INITIAL_CAPTURE_STATE);
    const file = new File(['x'], 'a.jpg');
    await attemptShot({ ...s, byShutter: true, capture: async () => ({ file, snapshot: null }) });
    expect(s.stateRef.current.takenHashes).toEqual([HASH]);
    expect(s.shotHashes.get(file)).toBe(HASH);
    expect(s.onTaken).toHaveBeenCalledOnce();
  });
});

describe('a shot under way', () => {
  it('keeps its page remembered when the machine fires again before the photo lands', async () => {
    const s = setup(markTaken(INITIAL_CAPTURE_STATE, HASH));
    let land!: (shot: { file: File; snapshot: null }) => void;
    const shot = attemptShot({ ...s, quad: null, byShutter: false, capture: () => new Promise((r) => { land = r; }) });
    // the frame after: the machine fires on the same page, the shot is still under way, so no second photo
    restoreUntaken(s.stateRef, s.keptRef, s.pending);
    expect(s.stateRef.current.takenHashes).toEqual([HASH]);
    land({ file: new File(['x'], 'a.jpg'), snapshot: null });
    await shot;
    expect(s.stateRef.current.takenHashes).toEqual([HASH]);
  });

  it('a failed shot is no longer under way', async () => {
    const s = setup(markTaken(INITIAL_CAPTURE_STATE, HASH));
    await attemptShot({ ...s, quad: null, byShutter: false, capture: () => Promise.reject(new Error('no photo')) });
    expect(s.pending.current).toBeNull();
    restoreUntaken(s.stateRef, s.keptRef, s.pending);
    expect(s.stateRef.current.takenHashes).toEqual([]);
  });
});
