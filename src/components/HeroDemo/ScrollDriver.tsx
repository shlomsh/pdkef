import { useEffect } from 'preact/hooks';

/**
 * The only script HeroDemo ships. It reads nothing from the page but scroll
 * position and writes nothing but `--p-*` custom properties (per-property
 * CSSOM writes via `style.setProperty`, never a literal `style="..."`
 * attribute - see CLAUDE.md's CSP section) onto the two sticky stage
 * elements HeroDemo.astro already rendered. All copy and structure comes
 * from that server-rendered markup; this component supplies motion only,
 * and supplies nothing at all when `prefers-reduced-motion` is set or JS
 * never loads, at which point HeroDemo.module.css's own defaults (every
 * beat at its finished value) already show the completed story - see that
 * file's "Layer visibility/crossfade" comment.
 *
 * One track's beat map is one ordered set of [start, end] progress windows
 * that must sum to the visual story dirE.html (the approved reference)
 * plays out. They live only here - CSS never hardcodes a boundary, it only
 * ever reads whatever 0-1 value shows up in each --p-<beat> - so there is
 * one place that owns pacing, matching the "one owner" rule this codebase
 * applies to geometry math (CLAUDE.md Part II section 3.2).
 */
type BeatRange = [number, number];

type TrackConfig = {
  /** Matches the `data-hero-track` value HeroDemo.astro renders. */
  key: string;
  beats: Record<string, BeatRange>;
};

const TRACKS: TrackConfig[] = [
  {
    // 12 beats (was 10): the printed form now carries a second sentence
    // ("It will take place from [time] to [time]"), so "fill-time-start"
    // and "fill-time-end" join "fill-date"/"fill-dest" as their own beats -
    // one beat per blank, matching every other field. This followed a
    // product-owner correction: the sentence used to reflow as each blank
    // filled (the wrap's own *width* was the animated property), and a PDF
    // page cannot reflow - pdkef draws form fields as fixed-position
    // overlays on a raster that never moves, so a demo whose printed text
    // visibly shifted was depicting something the product cannot do. Fixed
    // in HeroDemo.astro/HeroDemo.module.css: every blank is now a
    // constant-width reserved space from frame 0, and only an absolutely
    // positioned value overlay inside it reveals via clip-path - nothing
    // these beats drive ever changes a laid-out box's size.
    key: 'sign',
    beats: {
      msg: [0.0, 0.06],
      open: [0.06, 0.13],
      'fill-date': [0.13, 0.23],
      'fill-dest': [0.23, 0.33],
      'fill-time-start': [0.33, 0.42],
      'fill-time-end': [0.42, 0.5],
      'check-1': [0.5, 0.58],
      'check-2': [0.58, 0.65],
      sign: [0.65, 0.78],
      share: [0.78, 0.88],
      send: [0.88, 0.94],
      sent: [0.94, 1.0],
    },
  },
  {
    // 8 beats (was 6): "blur-1"/"blur-2" (two hardcoded instances of the
    // same effect) were replaced by four distinct redaction tools, one
    // beat each - "blur" (real filter: blur, see HeroDemo.module.css's
    // .blur-value comment), "blackout", "whiteout" and "delete" - per
    // DEMO-02 directive 3.
    key: 'blur',
    beats: {
      arrive: [0.0, 0.08],
      open: [0.08, 0.18],
      blur: [0.18, 0.34],
      blackout: [0.34, 0.48],
      whiteout: [0.48, 0.62],
      delete: [0.62, 0.76],
      send: [0.76, 0.9],
      sent: [0.9, 1.0],
    },
  },
];

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export default function ScrollDriver({ rootSelector }: { rootSelector: string }) {
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: no-preference)');
    if (!mql.matches) return;

    const root = document.querySelector(rootSelector);
    if (!root) return;

    const tracks = TRACKS.map(({ key, beats }) => ({
      beats,
      trackEl: root.querySelector<HTMLElement>(`[data-hero-track="${key}"]`),
      stageEl: root.querySelector<HTMLElement>(`[data-hero-track="${key}"] [data-hero-stage]`),
    })).filter(
      (t): t is { beats: Record<string, BeatRange>; trackEl: HTMLElement; stageEl: HTMLElement } =>
        !!t.trackEl && !!t.stageEl
    );
    if (tracks.length === 0) return;

    // Progress is recomputed from scroll position every call, never
    // accumulated, so scrolling back up genuinely un-fills the form rather
    // than replaying a recorded delta - the whole point of a scroll-driven
    // (not auto-playing) demo.
    function update() {
      for (const track of tracks) {
        const trackRect = track.trackEl.getBoundingClientRect();
        // The stage's own rendered height, not window.innerHeight: the
        // first stage's height can be overridden smaller than 100svh from
        // outside this component (see HeroDemo.module.css's --herodemo-
        // panel-height), and a sticky element only remains pinned for
        // (track height - its own height) of scrolling, regardless of how
        // tall the viewport happens to be.
        const stageHeight = track.stageEl.getBoundingClientRect().height;
        const scrollable = trackRect.height - stageHeight;
        const progress = scrollable <= 0 ? (trackRect.top <= 0 ? 1 : 0) : clamp01(-trackRect.top / scrollable);

        // The raw, un-sliced 0-1 value for this track alone, before it gets
        // cut into named beat windows below. This is what drives the DEMO-05
        // progress indicator (HeroDemo.module.css's .progress-rail): each
        // stage carries one "how far through this story" number, written the
        // same way every other beat is, so the indicator has no second
        // mechanism of its own. It defaults to 1 in CSS (see .stage-base),
        // matching every other --p-* default, so the no-JS/reduced-motion
        // stills show both stories as complete rather than the indicator
        // reading a stale or empty value.
        track.stageEl.style.setProperty('--p-track', String(progress));

        let openLocal = 0;
        for (const beat in track.beats) {
          const [start, end] = track.beats[beat];
          const local = clamp01((progress - start) / (end - start));
          track.stageEl.style.setProperty(`--p-${beat}`, String(local));
          if (beat === 'open') openLocal = local;
        }
        if ('open' in track.beats) {
          // A short pulse around the moment the file/document opens, peaking
          // exactly at open's midpoint and fading out on either side.
          const pulse = 1 - Math.abs(openLocal * 2 - 1);
          track.stageEl.style.setProperty('--p-tap', String(pulse));
        }
      }
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [rootSelector]);

  return null;
}
