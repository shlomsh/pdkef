// What the viewfinder's one line says (SCAN-24): the one thing that would make the shot better. Pure: the latest
// frame observation, the capture machine's phase and the guidance so far in, the guidance for this frame out. It
// only chooses words; the shutter and the capture machine never wait for it.
//
// Priority, first wins. Framing comes before steadiness, in the order a person sets up a shot: get the whole page
// in, close enough, standing out from the table, seen from above, then hold still.
//   turn       a page was just taken (waitingForChange): say so at once, it is the answer to the shot
//   duplicate  this page is taken already (SCAN-23): nothing is taken until the page turns
//   fit        a corner sits on the frame's edge, or did a moment ago and the page is lost since: it is cut off
//   closer     the page is under minArea of the frame: the camera will not take it
//   contrast   the page's border barely steps from the table, or nothing is found against a light view
//   flatter    the page is seen steeply: it is taken, but its far side keeps less detail
//   hold       a page is followed but blurred or moving, or all is well and the hold ring is filling
//              (a blurred page is never told "point", even when the blur lowers its confidence)
//   point      no page in view
// fit, closer and contrast stop the shot or make it unreliable; flatter only costs detail; hold resolves itself.
//
// Steady: every reading has its own way in and out (hysteresis), and the line changes only once the new hint has
// been wanted for settleMs AND the shown one has stood for minShowMs. turn alone cuts in at once.
import type { Quad } from '../quad.ts';
import { DEFAULT_CAPTURE_PARAMS, type CaptureParams, type CapturePhase, type FrameObservation } from './types.ts';

/** The hints, one per line the viewfinder can say. */
export type Hint = 'point' | 'hold' | 'turn' | 'duplicate' | 'fit' | 'closer' | 'contrast' | 'flatter';

/** The readings that hold their state between frames (hysteresis). */
interface Readings {
  /** A corner on the frame's edge. */
  edge: boolean;
  /** The page under minArea. */
  small: boolean;
  /** The page's border too faint against the table. */
  faint: boolean;
  /** Nothing dark in view, with no page found. */
  light: boolean;
  /** The page seen steeply. */
  steep: boolean;
  /** The page blurred. */
  blurred: boolean;
}

export interface Guidance {
  /** The hint on screen. */
  hint: Hint;
  /** Since when it has been on screen; null before the first frame. */
  since: number | null;
  /** The hint the latest frame wanted, and since when it has wanted it. */
  wanted: Hint;
  wantedSince: number | null;
  readings: Readings;
  /** When a corner was last on the frame's edge. */
  edgeSeenAt: number | null;
  /** The hint screen readers were last told, and when; announced politely, at most every speakGapMs. */
  spoken: Hint | null;
  spokenAt: number | null;
}

export const INITIAL_GUIDANCE: Guidance = {
  hint: 'point',
  since: null,
  wanted: 'point',
  wantedSince: null,
  readings: { edge: false, small: false, faint: false, light: false, steep: false, blurred: false },
  edgeSeenAt: null,
  spoken: null,
  spokenAt: null,
};

/** First guesses from synthetic frames (pageSignals tests), to be tuned on the SCAN-05 corpus and a real phone. */
interface GuidanceParams {
  /** The shortest time a hint stays on screen: a short line read at a glance, about a second. */
  minShowMs: number;
  /** How long a new hint must be wanted before it shows: 5 frames at the iPhone's 12.5 a second (SCAN-04). */
  settleMs: number;
  /** The shortest gap between two announcements, so speech never queues up; turn is always announced. */
  speakGapMs: number;
  /** A corner this close to the frame's edge (normalized) is on it; the reading clears beyond edgeLeave. */
  edgeEnter: number;
  edgeLeave: number;
  /** After the page is lost, how long a corner on the edge still says "fit" (a page too close is not found). */
  edgeMemoryMs: number;
  /** The small reading clears once the area is this many times minArea. */
  areaLeave: number;
  /** Border contrast under contrastEnter is faint; it clears at contrastLeave. */
  contrastEnter: number;
  contrastLeave: number;
  /** With no page found, a light floor at or over lightEnter is a light view; it clears under lightLeave. */
  lightEnter: number;
  lightLeave: number;
  /** A keystone under keystoneEnter is steep; it clears at keystoneLeave. */
  keystoneEnter: number;
  keystoneLeave: number;
  /** The blurred reading clears at this many times minSharpness. */
  sharpLeave: number;
}

/** @testSeam The tests time their frames by these; the camera uses the defaults. */
export const DEFAULT_GUIDANCE_PARAMS: GuidanceParams = {
  minShowMs: 1200,
  settleMs: 400,
  speakGapMs: 3000,
  // 1% is 3 px of the 320 px analysis frame: a page edge that close is the frame's edge, or past it.
  edgeEnter: 0.01,
  edgeLeave: 0.025,
  edgeMemoryMs: 1500,
  areaLeave: 1.15,
  // A white page (225) is found with full confidence down to a border step of about 0.3, with less from 0.29 and
  // not at all under 0.21 (bg 170): hint before the outline starts to slip, stop once it is safely back.
  contrastEnter: 0.25,
  contrastLeave: 0.3,
  // The light floor where that same page stops being found (0.6 to 0.65); a dark desk reads 0.07 to 0.21.
  lightEnter: 0.6,
  lightLeave: 0.55,
  // Under 0.6 the far side has under 60% of the near side's pixels: about 20 degrees of tilt with the page filling
  // the frame, 35 with it at half. A slightly tilted phone (0.75 to 0.95) is left alone.
  keystoneEnter: 0.6,
  keystoneLeave: 0.7,
  sharpLeave: 1.25,
};

const onEdge = (quad: Quad, margin: number) => quad.some((p) => p.x <= margin || p.y <= margin || p.x >= 1 - margin || p.y >= 1 - margin);

/** A reading with hysteresis: on past `enter`, off only once past `leave`. */
const latch = (was: boolean, enter: boolean, leave: boolean) => (was ? !leave : enter);

function read(was: Readings, obs: FrameObservation, params: GuidanceParams, capture: CaptureParams): Readings {
  const { quad } = obs;
  if (!quad) {
    // Nothing found: keep what the page last read like, and judge the view as a whole.
    const light = obs.light === undefined ? false : latch(was.light, obs.light >= params.lightEnter, obs.light < params.lightLeave);
    return { ...was, edge: false, light };
  }
  const { contrast, keystone } = obs;
  return {
    edge: latch(was.edge, onEdge(quad, params.edgeEnter), !onEdge(quad, params.edgeLeave)),
    small: latch(was.small, obs.area < capture.minArea, obs.area >= capture.minArea * params.areaLeave),
    faint: contrast === undefined ? false : latch(was.faint, contrast < params.contrastEnter, contrast >= params.contrastLeave),
    light: false,
    steep: keystone === undefined ? false : latch(was.steep, keystone < params.keystoneEnter, keystone >= params.keystoneLeave),
    blurred: latch(was.blurred, obs.sharpness < capture.minSharpness, obs.sharpness >= capture.minSharpness * params.sharpLeave),
  };
}

/** The hint this frame wants, by the priority at the top of this file. */
function want(phase: CapturePhase, obs: FrameObservation, r: Readings, edgeRecent: boolean, capture: CaptureParams): Hint {
  if (phase === 'waitingForChange') return 'turn';
  if (phase === 'duplicate') return 'duplicate';
  if (!obs.quad) {
    if (edgeRecent) return 'fit';
    return r.light ? 'contrast' : 'point';
  }
  if (r.edge) return 'fit';
  if (r.small) return 'closer';
  if (r.faint) return 'contrast';
  // Found, but not like a page and not for blur: no advice to give beyond pointing at one.
  if (obs.confidence < capture.minConfidence && !r.blurred) return 'point';
  if (r.steep) return 'flatter';
  // Blurred, moving (the machine's locked) or holding: all say hold still.
  return 'hold';
}

/** The guidance after one more frame. `phase` is the capture machine's phase after that frame. */
export function stepGuidance(
  g: Guidance,
  obs: FrameObservation,
  phase: CapturePhase,
  params: GuidanceParams = DEFAULT_GUIDANCE_PARAMS,
  capture: CaptureParams = DEFAULT_CAPTURE_PARAMS,
): Guidance {
  const t = obs.t;
  const readings = read(g.readings, obs, params, capture);
  const edgeSeenAt = readings.edge ? t : g.edgeSeenAt;
  const edgeRecent = edgeSeenAt !== null && t - edgeSeenAt <= params.edgeMemoryMs;
  const wanted = want(phase, obs, readings, edgeRecent, capture);
  const wantedSince = wanted === g.wanted && g.wantedSince !== null ? g.wantedSince : t;

  let { hint, since } = g;
  if (since === null) {
    hint = wanted;
    since = t;
  } else if (wanted !== hint) {
    const settled = t - since >= params.minShowMs && t - wantedSince >= params.settleMs;
    if (wanted === 'turn' || settled) {
      hint = wanted;
      since = t;
    }
  }

  let { spoken, spokenAt } = g;
  if (hint !== spoken && (spokenAt === null || hint === 'turn' || t - spokenAt >= params.speakGapMs)) {
    spoken = hint;
    spokenAt = t;
  }
  return { hint, since, wanted, wantedSince, readings, edgeSeenAt, spoken, spokenAt };
}

/** A page bent this far is worth a quiet note: the dewarp's largest displacement (SCAN-21's bentPx) over the
 * page's long edge. 0.008 is about 19 px at the 2400 px output, 2.4 mm on A4 and half a line of 12 pt text: a fold
 * or a curl someone can see and smooth out. The gentle sag of a loose sheet (about 1 mm, 8 px) stays quiet, and
 * so does anything near the dewarp's own floor (lineBend's MIN_BEND, 0.0015 of the page).
 * @testSeam The tests check the pixels it comes to; looksBent is what the pages read. */
export const BENT_SHARE = 0.008;

/** True when a processed page was strongly bent or creased. `bentPx` is optional until SCAN-21 lands; absent is flat. */
export function looksBent(page: { width: number; height: number; bentPx?: number } | null | undefined): boolean {
  if (!page) return false;
  const long = Math.max(page.width, page.height);
  return long > 0 && (page.bentPx ?? 0) > BENT_SHARE * long;
}
