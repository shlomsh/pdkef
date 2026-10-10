// The O's pacing (TheO.astro, docs/home-the-o.md): every scroll-driven moment
// in the story, in svh of scrolling from the moment the stage pins. theO.css
// holds the shapes, colours and structure; this holds when things happen, and
// theOTimelineCss() turns it into the percentages of the pin that the keyframes
// and animation ranges need. A slower wipe or a longer rest is one number here.
export const PACE = {
  // The first card's words light as soon as the stage pins.
  settle: 3,
  // A card at rest, its words lit, before the next change starts.
  rest: 160,
  // A colour wipe: the next card opening as a circle from the ring.
  wipe: 100,
  // The ring changing shape: the zero into the O, the O into the window.
  morph: 120,
  // Held once a change has finished, before its words fade in.
  beat: 9,
  // The zero starts rounding into the O this far into card 4's wipe.
  morphIntoWipe: 0.75,
  // The window's shade starts rising this far into the O's change into the
  // window, and takes this long; the window's words light while it rises.
  shadeIntoMorph: 0.7,
  shade: 100,
  // Airplane mode switches on this long after the shade is up.
  toggleAfter: 30,
  toggle: 9,
  // The flight, from take-off: each waypoint of o-fly, then touchdown. The
  // plane rolls over into paper between the first two.
  flight: { climb: 30, roll: 75, glide: 135, descend: 195, land: 232 },
  // The last card opens this long after take-off, and its sentence lights
  // this far into its wipe, well before the plane lands on it.
  finaleAfter: 60,
  finaleLitIntoWipe: 0.7,
  // The landed plane at rest before the page moves on.
  landed: 128,
};

export type Pace = typeof PACE;
type Span = readonly [number, number];

export interface TheOTimeline {
  total: number;
  // lit[n - 1]: when card n's words light.
  lit: number[];
  // wipes[n]: card n's colour wipe, cards 2 to 6.
  wipes: Record<2 | 3 | 4 | 5 | 6, Span>;
  intoO: Span;
  intoWindow: Span;
  shade: Span;
  clouds: Span;
  toggle: Span;
  takeoff: number;
  waypoints: { climb: number; roll: number; glide: number; descend: number; land: number };
  roll: Span;
  // The instant the roll is edge-on and the plane's face becomes paper.
  swap: number;
}

export function theOTimeline(pace: Pace = PACE): TheOTimeline {
  const lit = [pace.settle];
  const nextChange = () => lit[lit.length - 1] + pace.rest;
  const span = (start: number, length: number): Span => [start, start + length];

  const b2 = span(nextChange(), pace.wipe);
  lit.push(b2[1] + pace.beat);
  const b3 = span(nextChange(), pace.wipe);
  lit.push(b3[1] + pace.beat);
  const b4 = span(nextChange(), pace.wipe);
  const intoO = span(b4[0] + pace.wipe * pace.morphIntoWipe, pace.morph);
  lit.push(intoO[1] + pace.beat);
  // The O stays the O while the night card opens around it, then it grows
  // into the window, whose shade rises as it finishes.
  const b5 = span(nextChange(), pace.wipe);
  const intoWindow = span(b5[1], pace.morph);
  const shade = span(intoWindow[0] + pace.morph * pace.shadeIntoMorph, pace.shade);
  lit.push(intoWindow[1] + pace.beat);

  const toggle = span(shade[1] + pace.toggleAfter, pace.toggle);
  const takeoff = nextChange();
  const at = (offset: number) => takeoff + offset;
  const waypoints = {
    climb: at(pace.flight.climb),
    roll: at(pace.flight.roll),
    glide: at(pace.flight.glide),
    descend: at(pace.flight.descend),
    land: at(pace.flight.land),
  };
  const roll: Span = [waypoints.climb, waypoints.roll];
  const b6 = span(at(pace.finaleAfter), pace.wipe);
  lit.push(b6[0] + pace.wipe * pace.finaleLitIntoWipe);

  return {
    total: waypoints.land + pace.landed,
    lit,
    wipes: { 2: b2, 3: b3, 4: b4, 5: b5, 6: b6 },
    intoO,
    intoWindow,
    shade,
    // The clouds drift from the moment the shade starts rising until the last
    // card has covered the window.
    clouds: [shade[0], b6[1]],
    toggle,
    takeoff,
    waypoints,
    roll,
    swap: (roll[0] + roll[1]) / 2,
  };
}

// The scroll-timed rules theO.css leaves out, as CSS: the pin's height, the
// keyframes whose stops are moments in the story, and every animation range.
// It ships inline after theO.css (which the build minifies), so it is written
// out already compact: no comments, and no line breaks or indents.
// o-fly: take off along the line, climb over the heading while rolling into
// paper, glide over the top, then come down the clear lane at the end of the
// last line and flare onto its baseline.
export function theOTimelineCss(timeline: TheOTimeline = theOTimeline()): string {
  const pct = (svh: number) => `${+((svh / timeline.total) * 100).toFixed(2)}%`;
  const range = ([start, end]: Span) => `contain ${pct(start)} contain ${pct(end)}`;
  const from = (start: number) => `contain ${pct(start)} contain 100%`;
  const { lit, wipes, intoO, intoWindow, waypoints: w } = timeline;

  const css = `
@keyframes o-path {
  0%, ${pct(intoO[0])} { translate: 0 0; }
  ${pct(intoO[1])}, ${pct(intoWindow[0])} { translate: var(--o-tx) var(--o-ty); }
  ${pct(intoWindow[1])}, 100% { translate: var(--w-tx) var(--w-ty); }
}
@keyframes o-shape {
  0%, ${pct(intoO[0])} { scale: var(--zx) 1; }
  ${pct(intoO[1])}, ${pct(intoWindow[0])} { scale: var(--o-sx) var(--o-sy); }
  ${pct(intoWindow[1])}, 100% { scale: 1.04 1.3; }
}
@keyframes o-frame {
  0%, ${pct(intoWindow[0])} { border-width: calc(var(--R) * 0.16) calc(var(--R) * 0.21); border-radius: 50%; }
  ${pct(intoWindow[1])}, 100% { border-width: calc(var(--R) * 0.12) calc(var(--R) * 0.15); border-radius: 46% / 40%; }
}
@keyframes o-fly {
  0%, ${pct(timeline.takeoff)} { translate: 0 0; rotate: 0deg; scale: 1; }
  ${pct(w.climb)} { translate: var(--f1-tx) var(--f1-ty); rotate: -20deg; scale: 1.15; }
  ${pct(w.roll)} { translate: var(--f2-tx) var(--f2-ty); rotate: -32deg; scale: var(--f-big); }
  ${pct(w.glide)} { translate: var(--f3-tx) var(--f3-ty); rotate: 0deg; scale: var(--f-big); }
  ${pct(w.descend)} { translate: var(--f4-tx) var(--f4-ty); rotate: 38deg; scale: calc(var(--f-land) * 1.25); }
  ${pct(w.land)}, 100% { translate: var(--l-tx) var(--l-ty); rotate: 0deg; scale: var(--f-land); }
}
@keyframes o-cues {
  0% { --o-lit: 0; --o-landed: 0; }
${lit.map((svh, i) => `  ${pct(svh)} { --o-lit: ${i + 1}; }`).join('\n')}
  ${pct(w.land)} { --o-landed: 1; }
  100% { --o-lit: ${lit.length}; --o-landed: 1; }
}
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .o-track { height: calc(${timeline.total}svh + 100svh - var(--home-nav-height, 0px)); }
${Object.entries(wipes).map(([n, wipe]) => `    .b${n} > .o-art { animation-range: ${range(wipe)}; }`).join('\n')}
    .o-cloud { animation-range: ${range(timeline.clouds)}; }
    .o-shade { animation-range: ${range(timeline.shade)}; }
    .o-mode-on { animation-range: ${range(timeline.toggle)}; }
    .o-mode .o-plane { animation-range: ${from(timeline.takeoff)}; }
    .o-flight { animation-range: contain 0% contain 100%, ${from(timeline.takeoff)}; }
    .o-roll { animation-range: ${range(timeline.roll)}; }
    .o-face-plane, .o-face-paper { animation-range: ${from(timeline.swap)}; }
  }
}
`;
  return css.replace(/\n\s*/g, '');
}
