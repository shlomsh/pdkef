import { useEffect } from 'preact/hooks';
import { SIGN_END, CROSSFADE_START, CROSSFADE_END } from './storySplit.ts';

/**
 * The tour plays by itself while it is on screen. Scrolling still works as a
 * scrubber: it jumps to the matching moment, holds long enough to inspect it,
 * then continues from there. This makes the story understandable for someone
 * who never discovers that the old version needed page scrolling to move.
 *
 * Writes only per-property CSSOM values onto the server-rendered demo,
 * preserving CSP and the real story artwork. Reduced motion remains manually
 * scrubbed; no-JS uses the CSS finished stills.
 */
type BeatRange = [number, number];

type TrackConfig = {
  /** Matches the `data-hero-track` value HeroDemo.astro renders. */
  key: string;
  beats: Record<string, BeatRange>;
};

// A complete pass is deliberately short enough to notice without asking a
// visitor to babysit the page, while each beat still has time to read. The
// scroll pause makes a wheel/touch gesture feel like direct control rather
// than a fight with an independently moving demo.
const AUTOPLAY_CYCLE_MS = 38_000;
const SCRUB_HOLD_MS = 1_800;

// Give the complete incoming message and attachment a deliberate reading
// pause before the PDF opens. The sign track is made 8% longer in the CSS;
// remapping the subsequent beats into that longer journey retains each
// interaction's existing scroll duration instead of borrowing it from the
// form fill, signature, or share-sheet ending.
const CHAT_READING_HOLD = 0.08;
const afterChatReadingHold = (progress: number): number => (
  (progress + CHAT_READING_HOLD) / (1 + CHAT_READING_HOLD)
);

const TRACKS: TrackConfig[] = [
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
      msg: [-0.06, 0.0],
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
      // Let the quiet inbox read as an inbox before a new message lands.
      // The edit windows retain their former scroll length; the extra track
      // length comes from intentional holds instead of slower redactions.
      arrive: [0.072, 0.124],
      // A tap is a beat in its own right. Keeping the request on screen after
      // the ripple completes makes the following open read as a consequence
      // of that action, not an unrelated scene replacement.
      tap: [0.124, 0.168],
      open: [0.196, 0.261],
      blur: [0.261, 0.365],
      blackout: [0.365, 0.456],
      whiteout: [0.456, 0.547],
      delete: [0.547, 0.638],
      // Once the reply slides in, the cleaned attachment stays available to
      // inspect before the send action begins.
      send: [0.638, 0.729],
      sent: [0.809, 0.877],
    },
  },
];

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

// Exported so heroDemoStageDefaults.test.js can compute exactly what a
// mounted ScrollDriver writes onto [data-hero-stage] at any global scroll
// progress, using this same logic rather than a hand-copied re-derivation
// that could quietly drift from it. `update()` below calls these too, so
// there is only one implementation of the beat math, not two that happen to
// agree today.
export { TRACKS };

/** Which fraction of *this* track's own span `progress` (0-1 over the whole
 * tour) falls at. Mirrors `update()`'s `isFirst` branch. */
export function localProgressForTrack(key: string, progress: number): number {
  return key === 'sign'
    ? clamp01(progress / SIGN_END)
    : clamp01((progress - CROSSFADE_END) / (1 - CROSSFADE_END));
}

/** The full set of `--p-*` custom properties ScrollDriver writes onto one
 * track's [data-hero-stage] element for a given local (0-1, already mapped
 * through localProgressForTrack) progress - everything `update()`'s per-track
 * loop computes, minus the DOM writes themselves. `reducedMotion` mirrors
 * `mql.matches`. */
export function computeStageBeats(
  beats: Record<string, BeatRange>,
  localProgress: number,
  reducedMotion: boolean,
): Record<string, number> {
  const result: Record<string, number> = { track: localProgress };
  let openLocal = 0;
  let tapLocal: number | null = null;
  for (const [beat, [start, end]] of Object.entries(beats)) {
    const value = clamp01((localProgress - start) / (end - start));
    const local = reducedMotion ? Number(value >= 0.5) : value;
    result[beat] = local;
    if (beat === 'open') openLocal = local;
    if (beat === 'tap') tapLocal = local;
  }
  // Sign uses its attachment-opening beat as the tap. The mail story has a
  // dedicated tap beat so a reader can see the request press and settle
  // before the bill view begins to replace it. This assignment always wins
  // over any `tap` key the loop above already wrote from a `beats` entry -
  // matching `update()`, which sets `--p-tap` a second time after its loop
  // for the same reason.
  const interactionLocal = tapLocal ?? openLocal;
  result.tap = reducedMotion ? 0 : 1 - Math.abs(interactionLocal * 2 - 1);
  return result;
}

// Resolves which element is actually pinned right now. Desktop pins the
// whole hero (header, launcher, demo and dock hold still together);
// mobile pins only the demo frame once the first screen has scrolled past
// (see index.astro's two .home-hero grids and their [data-demo-pin]
// elements). Both candidates are always in the DOM - only one of them is
// ever `position: sticky` at a given breakpoint - so the live one is found
// by asking the computed style rather than guessing from viewport width,
// which would drift the moment a breakpoint number changed in only one place.
function resolvePin(): { pin: HTMLElement; track: HTMLElement } | null {
  const pin = [...document.querySelectorAll<HTMLElement>('[data-demo-pin]')]
    .find(el => getComputedStyle(el).position === 'sticky');
  const track = pin && document.querySelector<HTMLElement>(`[data-demo-track="${pin.dataset.demoPin}"]`);
  return pin && track ? { pin, track } : null;
}

export default function ScrollDriver({ rootSelector }: { rootSelector: string }) {
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const root = document.querySelector(rootSelector);
    let resolved = resolvePin();
    if (!root || !resolved) return;
    const tracks = TRACKS.map(({ key, beats }) => ({
      key, beats,
      trackEl: root.querySelector<HTMLElement>(`[data-hero-track="${key}"]`),
      stageEl: root.querySelector<HTMLElement>(`[data-hero-track="${key}"] [data-hero-stage]`),
    }));

    function scrollProgress() {
      if (!resolved) return;
      const { pin, track } = resolved;
      const top = parseFloat(getComputedStyle(pin).top) || 0;
      const travel = Math.max(1, track.offsetHeight - pin.offsetHeight);
      return clamp01((top - track.getBoundingClientRect().top) / travel);
    }

    function update(progress: number) {
      // The two beat maps share one page-scroll-compatible span; see the
      // split constants above. Autoplay feeds that same span so scroll and
      // time always describe exactly the same frame.
      const crossfade = clamp01((progress - CROSSFADE_START) / (CROSSFADE_END - CROSSFADE_START));
      for (const {key, beats, trackEl, stageEl} of tracks) {
        if (!trackEl || !stageEl) continue;
        const isFirst = key === 'sign';
        const localProgress = localProgressForTrack(key, progress);
        // Treat story two as a distinct screen, not a crossfade. The first
        // complete panel travels out to the left as the second travels in
        // from the right, carrying its caption, progress rail and phone as
        // one object. That is easier to parse than two unrelated phone UIs
        // ghosting through one another.
        const storySlide = isFirst ? -100 * crossfade : 100 * (1 - crossfade);
        const storyVisible = isFirst ? Number(crossfade < 1) : Number(crossfade > 0);
        trackEl.style.setProperty('--story-slide', `${storySlide}%`);
        trackEl.style.setProperty('--caption-opacity', String(storyVisible));
        trackEl.style.setProperty('--story-opacity', String(storyVisible));
        const stageVars = computeStageBeats(beats, localProgress, mql.matches);
        for (const [prop, value] of Object.entries(stageVars)) {
          stageEl.style.setProperty(`--p-${prop}`, String(value));
        }
      }
    }

    let autoplayProgress = scrollProgress() ?? 0;
    let pausedUntil = 0;
    let lastFrameAt = performance.now();
    let isVisible = root.getBoundingClientRect().bottom > 0 && root.getBoundingClientRect().top < window.innerHeight;
    let ticking = false;

    function scrubToScrollPosition() {
      const progress = scrollProgress();
      if (progress === undefined) return;
      autoplayProgress = progress;
      pausedUntil = performance.now() + SCRUB_HOLD_MS;
      update(progress);
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        scrubToScrollPosition();
        ticking = false;
      });
    }

    function onResize() {
      // The pinned element itself changes at the desktop/mobile breakpoint
      // (see resolvePin above), so a resize crossing it must re-resolve
      // before the next scroll/autoplay frame reads a now-unpinned element's
      // stale `position: sticky` top.
      resolved = resolvePin();
      update(autoplayProgress);
    }

    function onMotionPreferenceChange() {
      autoplayProgress = scrollProgress() ?? autoplayProgress;
      update(autoplayProgress);
    }

    let frame = 0;
    function play(now: number) {
      const elapsed = now - lastFrameAt;
      lastFrameAt = now;
      if (!mql.matches && isVisible && document.visibilityState === 'visible' && now >= pausedUntil) {
        autoplayProgress = (autoplayProgress + elapsed / AUTOPLAY_CYCLE_MS) % 1;
        update(autoplayProgress);
      }
      frame = window.requestAnimationFrame(play);
    }

    const visibilityObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
      // Do not count the time the demo was off-screen as playback time.
      lastFrameAt = performance.now();
    }, { threshold: 0.15 });

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    mql.addEventListener('change', onMotionPreferenceChange);
    visibilityObserver.observe(root);
    update(autoplayProgress);
    frame = window.requestAnimationFrame(play);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      mql.removeEventListener('change', onMotionPreferenceChange);
      window.cancelAnimationFrame(frame);
      visibilityObserver.disconnect();
    };
  }, [rootSelector]);

  return null;
}
