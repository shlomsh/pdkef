import { useEffect } from 'preact/hooks';
import { SIGN_END, CROSSFADE_START, CROSSFADE_END } from './storySplit.ts';

/** Scroll position is the sole clock. Writes only per-property CSSOM values
 * onto the server-rendered demo, preserving CSP and the real story artwork.
 * Reduced motion advances discrete beats; no-JS uses the CSS finished stills.
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

/** The sign track's local progress used as the workspace-mode still: the
 * signature is drawn and every blank is filled, and `share` has not started,
 * so no sheet is covering the document. See update(). */
const WORKSPACE_STILL = 0.79;


function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export default function ScrollDriver({ rootSelector }: { rootSelector: string }) {
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const root = document.querySelector(rootSelector);
    const tour = document.getElementById('home-tour');
    const scene = tour?.querySelector<HTMLElement>('[data-working-area]');
    if (!root || !tour || !scene) return;
    const tracks = TRACKS.map(({ key, beats }) => ({
      key, beats,
      trackEl: root.querySelector<HTMLElement>(`[data-hero-track="${key}"]`),
      stageEl: root.querySelector<HTMLElement>(`[data-hero-track="${key}"] [data-hero-stage]`),
    }));

    function update() {
      if (!tour || !scene) return;
      // Workspace mode shows the demo as a still, not as something to scroll
      // through, and it has to be pinned deliberately rather than left to the
      // scroll maths. In that mode .home-tour is exactly one stage tall - the
      // extra 850svh only exists under [data-home-mode="tour"] - so `travel`
      // floors at 1px and the sticky scene unpins on the first pixel of
      // scroll. Progress would then jump straight to 1 and the demo would race
      // to its final frame (a sent reply) the moment the visitor scrolled at
      // all, which is a worse still than any frame of the story.
      //
      // WORKSPACE_STILL is the signed, filled slip just before the share sheet
      // slides up: the last frame in which the whole point of the tool - a
      // completed document - is on screen with nothing overlaying it.
      if (document.documentElement.dataset.homeMode === 'workspace') {
        for (const { key, beats, trackEl, stageEl } of tracks) {
          if (!trackEl || !stageEl) continue;
          const isFirst = key === 'sign';
          trackEl.style.setProperty('--caption-opacity', isFirst ? '1' : '0');
          trackEl.style.setProperty('--story-opacity', isFirst ? '1' : '0');
          stageEl.style.setProperty('--p-track', String(isFirst ? WORKSPACE_STILL : 0));
          for (const [beat, [start, end]] of Object.entries(beats)) {
            const value = isFirst ? clamp01((WORKSPACE_STILL - start) / (end - start)) : 0;
            stageEl.style.setProperty(`--p-${beat}`, String(value));
          }
          stageEl.style.setProperty('--p-tap', '0');
        }
        return;
      }
      const top = parseFloat(getComputedStyle(scene).top) || 0;
      const travel = Math.max(1, tour.offsetHeight - scene.offsetHeight);
      const progress = clamp01((top - tour.getBoundingClientRect().top) / travel);
      // The two beat maps share one native page-scroll span; see the split
      // constants above.
      const crossfade = clamp01((progress - CROSSFADE_START) / (CROSSFADE_END - CROSSFADE_START));
      for (const {key, beats, trackEl, stageEl} of tracks) {
        if (!trackEl || !stageEl) continue;
        const isFirst = key === 'sign';
        const localProgress = isFirst
          ? clamp01(progress / SIGN_END)
          : clamp01((progress - CROSSFADE_END) / (1 - CROSSFADE_END));
        // The outgoing phone holds full opacity underneath the incoming one
        // rather than fading out against it. Both tracks are absolutely
        // stacked and the second is later in the DOM, so it paints on top:
        // dissolving one up while dissolving the other down left the pair at
        // 0.5 each in the middle, which composites to 0.75 over the page and
        // shows the background through both phones at once. Holding the one
        // underneath means the dissolve is always fully opaque. It can then
        // drop to 0 the moment the incoming phone reaches 1, which is
        // invisible because it is completely covered by then.
        const storyOpacity = isFirst ? (crossfade >= 1 ? 0 : 1) : crossfade;
        // Captions cross with no overlap: the outgoing one is gone by the
        // midpoint and the incoming one starts there. They are two different
        // sentences in the same grid cell, so overlapping them is unreadable
        // in a way overlapping the phones is not - and this used to be a hard
        // binary flip at the midpoint, which popped while the phone beside it
        // dissolved smoothly.
        const captionOpacity = isFirst ? clamp01(1 - crossfade * 2) : clamp01(crossfade * 2 - 1);
        trackEl.style.setProperty('--caption-opacity', String(mql.matches ? Number(captionOpacity >= 0.5) : captionOpacity));
        trackEl.style.setProperty('--story-opacity', String(mql.matches ? Number(storyOpacity >= 0.5) : storyOpacity));
        stageEl.style.setProperty('--p-track', String(localProgress));
        let openLocal = 0;
        for (const [beat, [start, end]] of Object.entries(beats)) {
          const value = clamp01((localProgress - start) / (end - start));
          // Reduced motion keeps the story readable as discrete completed
          // beats, with no signature drawing, wipe, pulse, or crossfade.
          const local = mql.matches ? Number(value >= 0.5) : value;
          stageEl.style.setProperty(`--p-${beat}`, String(local));
          if (beat === 'open') openLocal = local;
        }
        stageEl.style.setProperty('--p-tap', String(mql.matches ? 0 : 1 - Math.abs(openLocal * 2 - 1)));
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
    mql.addEventListener('change', onScroll);
    const observer = new ResizeObserver(onScroll);
    observer.observe(tour);
    observer.observe(scene);
    // homeWorkspace.ts flips data-home-mode on a click as well as on scroll,
    // and the still/scrolled branch above is chosen from it - so the flip has
    // to re-run update() itself rather than waiting for the next scroll event
    // that may never come.
    const modeObserver = new MutationObserver(onScroll);
    modeObserver.observe(document.documentElement, { attributeFilter: ['data-home-mode'] });
    update();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      mql.removeEventListener('change', onScroll);
      observer.disconnect();
      modeObserver.disconnect();
    };
  }, [rootSelector]);

  return null;
}
