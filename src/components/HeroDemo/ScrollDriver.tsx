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
    // 10 beats (was 9): "share" is new - the OS share sheet, which is the
    // story's actual ending (DEMO-02 directive 2) - inserted between
    // "sign" and "send". "name-he"/"class-en" were renamed to "fill-date"/
    // "fill-dest" when story one moved from a Hebrew name field + English
    // class field to an English trip-date + destination sentence (the
    // renamed track height explanation lives in HeroDemo.module.css's
    // .track comment).
    key: 'sign',
    beats: {
      msg: [0.0, 0.07],
      open: [0.07, 0.16],
      'fill-date': [0.16, 0.28],
      'fill-dest': [0.28, 0.4],
      'check-1': [0.4, 0.49],
      'check-2': [0.49, 0.58],
      sign: [0.58, 0.74],
      share: [0.74, 0.85],
      send: [0.85, 0.93],
      sent: [0.93, 1.0],
    },
  },
  {
    key: 'blur',
    beats: {
      arrive: [0.0, 0.1],
      open: [0.1, 0.24],
      'blur-1': [0.24, 0.46],
      'blur-2': [0.46, 0.66],
      send: [0.66, 0.86],
      sent: [0.86, 1.0],
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
