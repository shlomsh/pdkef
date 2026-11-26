import { describe, expect, it } from 'vitest';
import { autoMayShoot, INITIAL_SHOT_POLICY, nextShotPolicy, type ShotEvent } from './shotPolicy.ts';

const run = (events: ShotEvent[], from: typeof INITIAL_SHOT_POLICY = INITIAL_SHOT_POLICY) =>
  events.reduce((state, event) => nextShotPolicy(state, event).state, from);
const refused = (): ShotEvent => ({ type: 'photoFailed', cameraLive: true });

describe('a refused photo', () => {
  it('is told, and auto shoots no more until a photo lands', () => {
    const after = run([{ type: 'shotStarted' }, refused()]);
    expect(after.photoRefused).toBe(true);
    expect(autoMayShoot(after, false)).toBe(false);
  });

  it('asked for again by the shutter and refused again is told again, with no automatic shot after it', () => {
    const started = run([{ type: 'shotStarted' }, refused(), { type: 'shotStarted' }]);
    expect(started.photoRefused).toBe(false);
    const after = run([refused()], started);
    expect(after.photoRefused).toBe(true);
    expect(autoMayShoot(after, false)).toBe(false);
  });

  it('that then lands by the shutter lets auto go on', () => {
    const after = run([{ type: 'shotStarted' }, refused(), { type: 'shotStarted' }, { type: 'photoLanded' }]);
    expect(after.photoRefused).toBe(false);
    expect(autoMayShoot(after, false)).toBe(true);
  });

  it('lets auto go on once the person turns Auto on again, on the page still in view', () => {
    const held = run([refused(), { type: 'autoSet', on: false }]);
    expect(held.photoRefused).toBe(true);
    const after = run([{ type: 'autoSet', on: true }], held);
    expect(after).toEqual(INITIAL_SHOT_POLICY);
  });

  it('is reported as a refusal while the camera runs, and as a cut when it stopped under the shot', () => {
    expect(nextShotPolicy(INITIAL_SHOT_POLICY, refused()).effects).toEqual([{ type: 'report', step: 'scan_camera_photo' }]);
    const cut = nextShotPolicy(INITIAL_SHOT_POLICY, { type: 'photoFailed', cameraLive: false });
    expect(cut.effects).toEqual([{ type: 'report', step: 'scan_camera_photo_cut' }]);
    expect(cut.state).toEqual(INITIAL_SHOT_POLICY);
  });
});

describe('auto', () => {
  it('shoots only while on, not paused and not held', () => {
    expect(autoMayShoot(INITIAL_SHOT_POLICY, false)).toBe(true);
    expect(autoMayShoot(INITIAL_SHOT_POLICY, true)).toBe(false);
    expect(autoMayShoot({ ...INITIAL_SHOT_POLICY, auto: false }, false)).toBe(false);
  });

  it('turned off keeps a refusal told and held', () => {
    const after = run([refused(), { type: 'autoSet', on: false }]);
    expect(after).toEqual({ auto: false, held: true, photoRefused: true });
  });
});
