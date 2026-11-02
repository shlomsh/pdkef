import { boxStyle, circleBox, coneBox, type Circle, type Rect, type Size } from './geometry.ts';

/** The lamp's choreography as data: which part moves, and its keys in milliseconds. Pure; lampPlayer.ts plays it. */
export type Part =
  | 'string' | 'ring' | 'morph' | 'face' | 'capsule' | 'ghost' | 'cone' | 'veil' | 'board' | 'site'
  | 'cord' | 'pull' | 'line' | 'settle' | 'tag';
export type Key = { t: number; ease?: string } & Record<string, string | number | undefined>;
interface Track { part: Part; keys: Key[] }
export interface Plan { duration: number; tracks: Track[] }

/** What the choreography needs measured, in viewport pixels. */
interface Marks {
  /** The bead: where it starts on the way in, where it rests on the way out. */
  bead: Circle;
  /** The capsule's pill. */
  capsule: Rect;
  /** The top of the cord, where the card's bottom edge is. */
  cordTop: number;
  viewport: Size;
  /** The page's FLIP transform (see flipTransform); without it the page does not move. */
  board?: string;
}

const ENTER_MS = 1600;
const EXIT_MS = 1750;
const REDUCED_MS = 240;
const DIP = 14;
const LAND = 980;
const SLIDE = 36;
const INOUT = 'cubic-bezier(.65, 0, .35, 1)';
const EMPH = 'cubic-bezier(.19, 1, .22, 1)';
const RETRACT = 'cubic-bezier(.5, 0, .12, 1)';
const OPEN = 'cubic-bezier(.16, 1, .3, 1)';
const SETTLE = 'cubic-bezier(.2, .7, .3, 1)';
const REST = 'translate(0px, 0px) scale(1)';
const BOARD_ORIGIN = { transformOrigin: '0 0' };

/** Keys to WAAPI keyframes: `t` becomes the offset and `ease` the easing of the segment that starts at that key. */
export function toKeyframes(duration: number, keys: Key[]): Keyframe[] {
  const frames = keys.map(({ t, ease, ...props }) => ({ ...props, offset: Math.min(1, t / duration), easing: ease ?? 'linear' })) as Keyframe[];
  if ((frames[0].offset as number) > 0) frames.unshift({ ...frames[0], offset: 0, easing: 'linear' });
  if ((frames[frames.length - 1].offset as number) < 1) frames.push({ ...frames[frames.length - 1], offset: 1 });
  return frames;
}

const circle = (c: Circle, dy = 0) => boxStyle(circleBox({ ...c, cy: c.cy + dy }));
const centreOf = (r: Rect): Circle => ({ cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: 0 });

/** In: the bead dips under the press, the cord retracts, the bead rides up and opens into the capsule; the lamp's light falls on the rising page. */
export function enterPlan(m: Marks): Plan {
  const { bead, capsule, viewport } = m;
  const centre = { ...centreOf(capsule), r: bead.r };
  const stringTop = m.cordTop;
  const stringHeight = Math.max(0, bead.cy - bead.r - stringTop);
  const string = { left: `${bead.cx - 0.75}px`, top: `${stringTop}px`, width: '1.5px' };
  const cone = boxStyle(coneBox(centre, viewport));
  const tracks: Track[] = [
    { part: 'string', keys: [
      { t: 0, opacity: 1, ...string, height: `${stringHeight}px`, ease: 'cubic-bezier(.5, 0, .9, .5)' },
      { t: 150, opacity: 1, ...string, height: `${stringHeight + DIP}px`, ease: 'cubic-bezier(.4, 0, 1, 1)' },
      { t: 300, opacity: 1, ...string, height: '0px' },
    ] },
    { part: 'ring', keys: [
      { t: 0, opacity: 0, ...circle(bead, DIP), transform: 'scale(1)' },
      { t: 150, opacity: 0.95, ...circle(bead, DIP), transform: 'scale(1)', ease: 'cubic-bezier(.2, .7, .3, 1)' },
      { t: 560, opacity: 0, ...circle(bead, DIP), transform: 'scale(3.4)' },
    ] },
    { part: 'morph', keys: [
      { t: 0, opacity: 1, ...circle(bead), ease: 'cubic-bezier(.5, 0, .9, .5)' },
      { t: 150, opacity: 1, ...circle(bead, DIP), ease: RETRACT },
      { t: 580, opacity: 1, ...boxStyle(circleBox(centre)), ease: OPEN },
      { t: 900, opacity: 1, ...boxStyle(capsule) },
    ] },
    { part: 'face', keys: [{ t: 0, opacity: 1 }, { t: 560, opacity: 1, ease: INOUT }, { t: 820, opacity: 0 }] },
    { part: 'capsule', keys: [{ t: 0, opacity: 0 }, { t: 780, opacity: 0, ease: INOUT }, { t: 1000, opacity: 1 }] },
    { part: 'cone', keys: [
      { t: 0, opacity: 0, ...cone }, { t: 380, opacity: 0, ...cone, ease: 'cubic-bezier(.2, .7, .3, 1)' },
      { t: 760, opacity: 1, ...cone }, { t: 1050, opacity: 1, ...cone, ease: INOUT }, { t: 1600, opacity: 0, ...cone },
    ] },
    { part: 'veil', keys: [{ t: 0, opacity: 0 }, { t: 160, opacity: 0, ease: INOUT }, { t: 480, opacity: 0.22 }, { t: 900, opacity: 0.22, ease: INOUT }, { t: 1500, opacity: 0 }] },
  ];
  if (m.board) {
    tracks.push({ part: 'board', keys: [
      { t: 0, transform: m.board, ...BOARD_ORIGIN }, { t: 220, transform: m.board, ...BOARD_ORIGIN, ease: EMPH }, { t: 1000, transform: REST, ...BOARD_ORIGIN },
    ] });
  }
  return { duration: ENTER_MS, tracks };
}

/** Out: the capsule closes into the bead, the bead drops onto its cord, which pays out, dips 3 px and swings once; the page shrinks back and the site slides down. */
export function exitPlan(m: Marks): Plan {
  const { bead, capsule } = m;
  const centre = { ...centreOf(capsule), r: bead.r };
  const pill = boxStyle(capsule);
  const closed = boxStyle(circleBox(centre));
  const tracks: Track[] = [
    { part: 'ghost', keys: [{ t: 0, opacity: 1 }, { t: 60, opacity: 1, ease: INOUT }, { t: 240, opacity: 0 }] },
    { part: 'morph', keys: [
      { t: 0, opacity: 1, ...pill }, { t: 60, opacity: 1, ...pill, ease: 'cubic-bezier(.65, 0, .35, 1)' },
      { t: 380, opacity: 1, ...closed }, { t: 420, opacity: 1, ...closed, ease: 'cubic-bezier(.55, 0, .2, 1)' },
      { t: LAND, opacity: 1, ...circle(bead) }, { t: LAND + 1, opacity: 0, ...circle(bead) },
    ] },
    { part: 'face', keys: [{ t: 0, opacity: 0 }, { t: 120, opacity: 0, ease: INOUT }, { t: 380, opacity: 1 }] },
    { part: 'pull', keys: [{ t: 0, opacity: 0 }, { t: LAND - 1, opacity: 0 }, { t: LAND, opacity: 1 }] },
    { part: 'line', keys: [{ t: 0, transform: 'scaleY(0)' }, { t: LAND - 90, transform: 'scaleY(0)', ease: SETTLE }, { t: LAND, transform: 'scaleY(1)' }] },
    { part: 'cord', keys: [
      { t: 0, transform: 'translateY(0px)' }, { t: LAND, transform: 'translateY(0px)', ease: SETTLE },
      { t: LAND + 90, transform: 'translateY(3px)', ease: INOUT }, { t: LAND + 260, transform: 'translateY(0px)' },
    ] },
    { part: 'settle', keys: [
      { t: 0, transform: 'rotate(0deg)' }, { t: LAND, transform: 'rotate(0deg)', ease: 'ease-out' },
      { t: LAND + 150, transform: 'rotate(-6deg)', ease: 'ease-in-out' }, { t: LAND + 380, transform: 'rotate(4deg)', ease: 'ease-in-out' },
      { t: LAND + 580, transform: 'rotate(-1.8deg)', ease: 'ease-in-out' }, { t: LAND + 760, transform: 'rotate(0deg)' },
    ] },
    { part: 'tag', keys: [{ t: 0, opacity: 0 }, { t: LAND, opacity: 0, ease: INOUT }, { t: LAND + 300, opacity: 1 }] },
    { part: 'site', keys: [
      { t: 0, opacity: 0, transform: `translateY(-${SLIDE}px)` }, { t: 330, opacity: 0, transform: `translateY(-${SLIDE}px)`, ease: OPEN },
      { t: 960, opacity: 1, transform: 'translateY(0px)' },
    ] },
  ];
  if (m.board) {
    tracks.push({ part: 'board', keys: [
      { t: 0, transform: m.board, ...BOARD_ORIGIN }, { t: 200, transform: m.board, ...BOARD_ORIGIN, ease: 'cubic-bezier(.65, 0, .35, 1)' }, { t: 880, transform: REST, ...BOARD_ORIGIN },
    ] });
  }
  return { duration: EXIT_MS, tracks };
}

/** Reduced motion: nothing travels. The capsule fades in, or the site fades back. */
export function reducedPlan(direction: 'enter' | 'exit'): Plan {
  const part: Part = direction === 'enter' ? 'capsule' : 'site';
  return { duration: REDUCED_MS, tracks: [{ part, keys: [{ t: 0, opacity: 0 }, { t: REDUCED_MS, opacity: 1 }] }] };
}
