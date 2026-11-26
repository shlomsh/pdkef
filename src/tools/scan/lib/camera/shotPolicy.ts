// When the camera may shoot by itself, and what a photo's outcome does to that (SCAN-78). Pure: events in, state and
// effects out. useCamera feeds it what happened (Auto turned on or off, a shot starting, a photo landing or failing)
// and acts on what it answers.

interface ShotPolicy {
  /** The person's Auto switch. */
  auto: boolean;
  /** A refused photo holds auto until a photo lands or Auto is turned on again: one refusal is never a run of them. */
  held: boolean;
  /** The browser refused the last photo, so the person is told. */
  photoRefused: boolean;
}

export const INITIAL_SHOT_POLICY: ShotPolicy = { auto: true, held: false, photoRefused: false };

export type ShotEvent =
  | { type: 'autoSet'; on: boolean }
  | { type: 'shotStarted' }
  | { type: 'photoLanded' }
  /** `cameraLive`: the camera was still running when the photo failed; false when it stopped under the shot. */
  | { type: 'photoFailed'; cameraLive: boolean };

export type ShotEffect = { type: 'report'; step: 'scan_camera_photo' | 'scan_camera_photo_cut' };

/** Whether a page held still is shot without the shutter. */
export const autoMayShoot = (policy: ShotPolicy, paused: boolean): boolean => policy.auto && !paused && !policy.held;

export function nextShotPolicy(policy: ShotPolicy, event: ShotEvent): { state: ShotPolicy; effects: ShotEffect[] } {
  switch (event.type) {
    case 'autoSet':
      return { state: event.on ? { auto: true, held: false, photoRefused: false } : { ...policy, auto: false }, effects: [] };
    case 'shotStarted':
      return { state: { ...policy, photoRefused: false }, effects: [] };
    case 'photoLanded':
      return { state: { ...policy, held: false }, effects: [] };
    case 'photoFailed':
      return {
        state: event.cameraLive ? { ...policy, held: true, photoRefused: true } : policy,
        effects: [{ type: 'report', step: event.cameraLive ? 'scan_camera_photo' : 'scan_camera_photo_cut' }],
      };
  }
}
