// The O's pacing (TheO.astro, docs/home-the-o.md): every scroll-driven moment
// in the story, in svh of scrolling from the moment the stage pins. theO.css
// holds the shapes, colours and structure; this holds when things happen, and
// theOTimelineCss() turns it into the percentages of the pin that the keyframes
// and animation ranges need. A slower wipe or a longer stall is one number here.
//
// The story is counted in ticks: one notch of a mouse wheel, about 100px, which
// is 12svh on an ordinary screen. Scroll leads everything, the words included
// (theO.css lights them in a third of a second), so a pause is a distance the
// reader chooses to cross, never a clock running against the finger. A card
// costs about ten ticks, one swipe on a phone: five to open it, one held, and
// a stall of four to six with its words lit and nothing moving.
/** @testSeam */
export const TICK = 12;

/** @testSeam */
export const PACE = {
  // The first card's words light as soon as the stage pins.
  settle: 3,
  // The stall on cards 1 to 4: words lit, nothing moving, before the next
  // change starts. The three zeros beat at one tempo; the third is held a tick
  // longer, the breath before the turn, and Open source longer still, for its
  // link.
  stall: [4 * TICK, 4 * TICK, 5 * TICK, 6 * TICK],
  // A colour wipe: the next card opening as a circle from the ring.
  wipe: 5 * TICK,
  // The ring changing shape: the zero into the O, the O into the window.
  morph: 6 * TICK,
  // Held once a change has finished, before its words light.
  beat: TICK,
  // The zero starts rounding into the O this far into card 4's wipe.
  morphIntoWipe: 0.5,
  // The window is three acts, each alone on the stage with a stall between
  // them. The window forms with its shade down and its words light. Then the
  // shade rises, slowly, the only thing moving. Then airplane mode switches
  // on, and after one more stall its plane takes off.
  shadeAfter: 2 * TICK,
  shade: 7 * TICK,
  toggleAfter: 2 * TICK,
  toggle: 2 * TICK,
  takeoffAfter: 2 * TICK,
  // The flight, from take-off. The plane lifts off the toggle growing, climbs,
  // and rolls over into paper between climb and roll, at its biggest. From
  // there it flies its route (FLIGHT_ROUTES) at a steady speed: over the top,
  // down the far side, round onto a long low final, and it touches down at
  // `land`. Then it rolls out along the runway, slowing, to `stop`.
  flight: { lift: 2 * TICK, climb: 5 * TICK, roll: 10 * TICK, land: 22 * TICK, stop: 25 * TICK },
  // The last card opens from the paper plane as its roll finishes. The card
  // is empty sky while the plane comes down through it: the runway draws in
  // under it, and the words light once the plane is low on final, clear of
  // them, two ticks before it touches down and five before it parks.
  finaleAfter: 9 * TICK,
  finaleWipe: 6 * TICK,
  runwayAfter: 13 * TICK,
  runway: 4 * TICK,
  finaleLitAfter: 20 * TICK,
  // The parked plane at rest before the page moves on.
  landed: 7 * TICK,
};

type Pace = typeof PACE;
type Span = readonly [number, number];

interface TheOTimeline {
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
  waypoints: { lift: number; climb: number; roll: number; land: number; stop: number };
  runway: Span;
  roll: Span;
  // The instant the roll is edge-on and the plane's face becomes paper.
  swap: number;
}

/** @testSeam */
export function theOTimeline(pace: Pace = PACE): TheOTimeline {
  const lit = [pace.settle];
  const nextChange = () => lit[lit.length - 1] + pace.stall[lit.length - 1];
  const span = (start: number, length: number): Span => [start, start + length];

  const b2 = span(nextChange(), pace.wipe);
  lit.push(b2[1] + pace.beat);
  const b3 = span(nextChange(), pace.wipe);
  lit.push(b3[1] + pace.beat);
  const b4 = span(nextChange(), pace.wipe);
  const intoO = span(b4[0] + pace.wipe * pace.morphIntoWipe, pace.morph);
  lit.push(intoO[1] + pace.beat);
  // The O stays the O while the night card opens around it, then it grows
  // into the window with its shade down. Its words light, and only then does
  // the shade rise.
  const b5 = span(nextChange(), pace.wipe);
  const intoWindow = span(b5[1], pace.morph);
  lit.push(intoWindow[1] + pace.beat);
  const shade = span(lit[lit.length - 1] + pace.shadeAfter, pace.shade);

  const toggle = span(shade[1] + pace.toggleAfter, pace.toggle);
  const takeoff = toggle[1] + pace.takeoffAfter;
  const at = (offset: number) => takeoff + offset;
  const waypoints = {
    lift: at(pace.flight.lift),
    climb: at(pace.flight.climb),
    roll: at(pace.flight.roll),
    land: at(pace.flight.land),
    stop: at(pace.flight.stop),
  };
  const roll: Span = [waypoints.climb, waypoints.roll];
  const b6 = span(at(pace.finaleAfter), pace.finaleWipe);
  lit.push(at(pace.finaleLitAfter));

  return {
    total: waypoints.stop + pace.landed,
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
    runway: span(at(pace.runwayAfter), pace.runway),
    roll,
    swap: (roll[0] + roll[1]) / 2,
  };
}

// The route the paper plane flies from the end of its roll to touchdown, as
// points it passes through: u is how far across (0 at the toggle it took off
// from, 1 where it parks), v how far down (0 near the top of the card, 1 on
// the runway). A wide card has room to the left of the toggle, so its route
// swings out there for a longer final; `aspect` is the usual width of that
// box over its height, which the plane's heading is worked out against.
type Point = readonly [number, number];
interface Route {
  name: string;
  aspect: number;
  from: Point;
  through: readonly Point[];
}
/** @testSeam */
export const FLIGHT_ROUTES: readonly Route[] = [
  {
    name: 'o-fly',
    aspect: 1,
    from: [0.12, 0.62],
    through: [[0.34, 0.3], [0.5, 0.12], [0.42, 0], [0.18, 0.04], [-0.2, 0.24], [-0.5, 0.52], [-0.45, 0.8], [-0.12, 0.95], [0.36, 1]],
  },
  {
    name: 'o-fly-tall',
    aspect: 0.8,
    from: [0.12, 0.62],
    through: [[0.34, 0.3], [0.5, 0.13], [0.42, 0], [0.22, 0.04], [0.08, 0.26], [0.03, 0.54], [0.08, 0.8], [0.22, 0.95], [0.5, 1]],
  },
];

interface RouteSample {
  // Share of the airborne time, 0 at the end of the roll and 1 at touchdown.
  at: number;
  u: number;
  v: number;
  // The plane's heading in degrees, 0 level and nose right, turning nose-up
  // as it goes negative; it only ever decreases, to -360 on the runway.
  heading: number;
}

// A smooth curve through the route's points (Catmull-Rom), sampled at even
// steps and timed by distance flown, so the plane keeps one speed in the air.
/** @testSeam */
export function flightRoute({ aspect, from, through }: Route, steps = 3): RouteSample[] {
  const points = [from, ...through, [through[through.length - 1][0] + 0.3, 1] as Point];
  const curve = (i: number, t: number, axis: 0 | 1) => {
    const [a, b, c, d] = [points[i - 1][axis], points[i][axis], points[i + 1][axis], points[i + 2][axis]];
    return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
  };
  const slope = (i: number, t: number, axis: 0 | 1) => {
    const [a, b, c, d] = [points[i - 1][axis], points[i][axis], points[i + 1][axis], points[i + 2][axis]];
    return 0.5 * (c - a + 2 * (2 * a - 5 * b + 4 * c - d) * t + 3 * (3 * b - a - 3 * c + d) * t * t);
  };
  const samples: RouteSample[] = [];
  let flown = 0;
  let heading = 0;
  for (let i = 1; i < points.length - 2; i++) {
    for (let step = i === 1 ? 0 : 1; step <= steps; step++) {
      const t = step / steps;
      const [u, v] = [curve(i, t, 0), curve(i, t, 1)];
      const last = samples[samples.length - 1];
      if (last) flown += Math.hypot((u - last.u) * aspect, v - last.v);
      let next = (Math.atan2(slope(i, t, 1), slope(i, t, 0) * aspect) * 180) / Math.PI;
      while (next > heading + 90) next -= 360;
      heading = next;
      samples.push({ at: flown, u, v, heading });
    }
  }
  // The last sample is touchdown itself: on the runway, level.
  const touchdown = through[through.length - 1];
  return samples.map((sample, i) =>
    i === samples.length - 1
      ? { at: 1, u: touchdown[0], v: touchdown[1], heading: -360 }
      : { ...sample, at: sample.at / flown },
  );
}

// The scroll-timed rules theO.css leaves out, as CSS: the pin's height, the
// keyframes whose stops are moments in the story, and every animation range.
// It ships inline after theO.css (which the build minifies), so it is written
// out already compact: no comments, and no line breaks or indents.
export function theOTimelineCss(timeline: TheOTimeline = theOTimeline()): string {
  const pct = (svh: number) => `${+((svh / timeline.total) * 100).toFixed(2)}%`;
  const range = ([start, end]: Span) => `contain ${pct(start)} contain ${pct(end)}`;
  const from = (start: number) => `contain ${pct(start)} contain 100%`;
  const { lit, wipes, intoO, intoWindow, waypoints: w } = timeline;
  const n = (value: number) => +value.toFixed(3);
  const eased = 'animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1);';
  // One o-fly per route. Take-off eases from pose to pose; the route is
  // flown at a steady speed, the plane shrinking from its biggest to its
  // landing size; the rollout slows to a stop.
  const fly = (route: Route) => {
    const samples = flightRoute(route);
    // Left of the toggle the route is measured against the room there is
    // (--f-left), so the plane never leaves the card on a narrow one.
    const reach = Math.max(0.001, -Math.min(...samples.map((sample) => sample.u)));
    const across = (u: number) => (u < 0 ? `calc(var(--f-left) * ${n(u / reach)} * var(--dir))` : `calc(var(--fdx) * ${n(u)} * var(--dir))`);
    const air = samples.map(({ at, u, v, heading }, i) => {
      const big = n(Math.max(0, 1 - at * 1.15));
      const last = i === samples.length - 1;
      const pose = `translate: ${across(u)} calc(var(--ft-ty) * ${n(1 - v)} + var(--l-ty) * ${n(v)}); rotate: ${n(heading)}deg; scale: calc(var(--f-big) * ${big} + var(--f-land) * ${n(1 - big)});`;
      return `  ${pct(w.roll + (w.land - w.roll) * at)} { ${pose}${last ? ' animation-timing-function: cubic-bezier(0.2, 0.6, 0.3, 1);' : ''} }`;
    });
    return `@keyframes ${route.name} {
  0%, ${pct(timeline.takeoff)} { translate: 0 0; rotate: 0deg; scale: 1; ${eased} }
  ${pct(w.lift)} { translate: var(--f0-tx) var(--f0-ty); rotate: -18deg; scale: 1.7; ${eased} }
  ${pct(w.climb)} { translate: var(--f1-tx) var(--f1-ty); rotate: -36deg; scale: calc(var(--f-big) * 0.8); ${eased} }
${air.join('\n')}
  ${pct(w.stop)}, 100% { translate: var(--l-tx) var(--l-ty); rotate: -360deg; scale: var(--f-land); }
}`;
  };

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
${FLIGHT_ROUTES.map(fly).join('\n')}
@keyframes o-cues {
  0% { --o-lit: 0; --o-off: 0; --o-landed: 0; }
${lit.map((svh, i) => `  ${pct(svh)} { --o-lit: ${i + 1}; }`).join('\n')}
  ${pct(timeline.takeoff)} { --o-off: 1; }
  ${pct(w.land)} { --o-landed: 1; }
  100% { --o-lit: ${lit.length}; --o-off: 1; --o-landed: 1; }
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
    .o-runway { animation-range: ${range(timeline.runway)}; }
    .o-roll { animation-range: ${range(timeline.roll)}; }
    .o-face-plane, .o-face-paper { animation-range: ${from(timeline.swap)}; }
  }
}
`;
  return css.replace(/\n\s*/g, '');
}
