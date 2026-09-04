import { useEffect } from 'preact/hooks';

/**
 * The only script HeroDemo ships. It reads nothing from the page but scroll
 * position and writes nothing but `--p-*` custom properties (per-property
 * CSSOM writes via `style.setProperty`, never a literal `style="..."`
 * attribute - see CLAUDE.md's CSP section) onto the sticky stage elements
 * HeroDemo.astro already rendered. All copy and structure comes
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

// Give the complete incoming message and attachment a deliberate reading
// pause before the PDF opens. The sign track is made 8% longer in the CSS;
// remapping the subsequent beats into that longer journey retains each
// interaction's existing scroll duration instead of borrowing it from the
// form fill, signature, or share-sheet ending.
const CHAT_READING_HOLD = 0.08;
const afterChatReadingHold = (progress: number): number => (
  (progress + CHAT_READING_HOLD) / (1 + CHAT_READING_HOLD)
);
const beforeChatReadingHold = (progress: number): number => (
  progress / (1 + CHAT_READING_HOLD)
);

const TRACKS: TrackConfig[] = [
  {
    // The intro title card. Two beats, no story: fade in over the first
    // fifth of the panel's pinned travel, hold for the middle, and fade back
    // out over the last third, reaching zero exactly as the panel releases -
    // which is the moment the first story pins, so the two fades meet (see
    // .track-intro's negative bottom margin, which is what aligns them).
    // HeroDemo.module.css turns these into one opacity (--p-in minus
    // --p-out). Above the two-column breakpoint
    // the track is display:none, so these values are still computed and
    // still written - onto an element that renders nothing. Harmless, and
    // cheaper than teaching this file about a breakpoint.
    key: 'intro',
    beats: {
      in: [0.0, 0.2],
      out: [0.66, 1.0],
    },
  },
  {
    // 12 beats. The four "fill-*" beats were renamed 2026-09-04 per a second
    // product-owner correction: the printed sentence used to carry blanks
    // for the trip's date, destination and times - fields the *school*
    // fills in before the slip ever goes out, not the parent. That read as
    // AI slop to anyone who has filled one in. Real permission slips (see
    // HeroDemo.astro's field-source comment) put the trip's own details
    // - destination, date, times, class/teacher - in printed text the
    // school already typed, and leave blanks for the parent's own details:
    // the student's name, the parent/guardian's name, an emergency contact
    // number, and any allergies or medical notes. So the trip sentence
    // became fully static (no beats at all - it never changes) and these
    // four beats now drive the parent's own blanks instead, one beat per
    // blank exactly as before, over the same four windows so the swap cost
    // no scroll distance. (Earlier, 2026-09-04: "fill-time-start" and
    // "fill-time-end" had joined "fill-date"/"fill-dest" as their own beats
    // after a first correction - the trip sentence used to reflow as each
    // blank filled, and a PDF page cannot reflow - pdkef draws form fields
    // as fixed-position overlays on a raster that never moves. That fix
    // (constant-width reserved spaces, an absolutely positioned value
    // overlay revealed via clip-path, nothing these beats drive ever
    // changes a laid-out box's size) still holds; only which fields sit in
    // those four slots changed.)
    key: 'sign',
    beats: {
      // Entrance crossfade, not a story beat: it stays 0 for the whole time
      // the panel is still travelling up from below the fold (progress is
      // pinned at 0 until the track's top reaches the viewport top), so the
      // panel is invisible while it moves and fades in once it has settled.
      // This is the second half of the intro card's handoff, which is why
      // only this track has it - see HeroDemo.module.css's .stage-first
      // opacity rule.
      enter: [0.0, 0.04],
      msg: [0.0, beforeChatReadingHold(0.06)],
      // Hold the complete chat view (the message and attached permission
      // slip) before crossfading to the PDF. The other sign-story beats are
      // remapped below so this new reading space does not make them faster.
      open: [afterChatReadingHold(0.06), afterChatReadingHold(0.13)],
      'fill-name': [afterChatReadingHold(0.13), afterChatReadingHold(0.23)],
      'fill-guardian': [afterChatReadingHold(0.23), afterChatReadingHold(0.33)],
      'fill-phone': [afterChatReadingHold(0.33), afterChatReadingHold(0.42)],
      'fill-allergies': [afterChatReadingHold(0.42), afterChatReadingHold(0.5)],
      'check-1': [afterChatReadingHold(0.5), afterChatReadingHold(0.58)],
      'check-2': [afterChatReadingHold(0.58), afterChatReadingHold(0.65)],
      sign: [afterChatReadingHold(0.65), afterChatReadingHold(0.78)],
      share: [afterChatReadingHold(0.78), afterChatReadingHold(0.88)],
      send: [afterChatReadingHold(0.88), afterChatReadingHold(0.94)],
      sent: [afterChatReadingHold(0.94), 1.0],
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
