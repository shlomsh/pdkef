/**
 * Guards the bug fixed alongside this test: HeroDemo.module.css's `.stage`
 * rule declares the `--p-*` custom properties that drive every panel's
 * beat-by-beat visibility, and ScrollDriver.tsx overwrites them on mount with
 * whatever the current scroll position computes to. Those two used to
 * disagree - the CSS defaulted every beat to 1 (the finished story) "for
 * no-JS and reduced-motion visitors", but ScrollDriver actually runs for
 * *both* motion preferences and, at the top of the page (progress 0), writes
 * something closer to 0 for nearly every beat. A JS-enabled visitor of either
 * kind therefore saw the completed story for one frame and then watched it
 * reset to empty - a flash on hydration, not a layout shift, so CLS never
 * caught it.
 *
 * The fix makes the CSS default equal what ScrollDriver writes at scroll
 * position 0, so hydration changes nothing a visitor can see. This test
 * computes that "what ScrollDriver writes at 0" side via the exact same
 * functions ScrollDriver.tsx uses at runtime (`localProgressForTrack`,
 * `computeStageBeats`) - never a hand re-derivation of the beat math, which
 * is exactly the kind of copy that drifted the first time - and compares it
 * against the real `.stage` rule parsed out of the real CSS file, not a
 * hand-copied literal of it.
 *
 * True no-JS visitors never run ScrollDriver at all, so flipping the defaults
 * to the scroll-0 state would have left them staring at an empty form. They
 * are served the finished story instead, by the `<noscript><link>` in
 * HeroDemo.astro pulling in public/hero-demo-noscript.css. That file is the
 * only thing standing between a no-JS visitor and a blank demo, and nothing
 * imports it, so the second suite below pins it: delete it, rename it, or let
 * it fall out of step with the beat map and a test fails rather than a silent
 * degradation shipping.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TRACKS, localProgressForTrack, computeStageBeats } from './ScrollDriver.tsx';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseNoscriptDefaults() {
  const path = join(__dirname, '..', '..', '..', 'public', 'hero-demo-noscript.css');
  const css = readFileSync(path, 'utf8');
  const match = css.match(/\[data-hero-stage\]\s*\{([\s\S]*?)\n\}/);
  if (!match) throw new Error('Could not find the [data-hero-stage] rule in public/hero-demo-noscript.css');
  const values = {};
  for (const declaration of match[1].matchAll(/--p-([\w-]+):\s*([\d.]+);/g)) {
    values[declaration[1]] = Number(declaration[2]);
  }
  return values;
}

function parseStageDefaults() {
  const css = readFileSync(join(__dirname, 'HeroDemo.module.css'), 'utf8');
  const stageMatch = css.match(/\.stage\s*\{([\s\S]*?)\n\}/);
  if (!stageMatch) throw new Error('Could not find .stage rule in HeroDemo.module.css');
  const body = stageMatch[1];
  const defaults = {};
  for (const match of body.matchAll(/--p-([\w-]+):\s*([\d.]+);/g)) {
    defaults[match[1]] = Number(match[2]);
  }
  return defaults;
}

describe('HeroDemo stage defaults match ScrollDriver at scroll position 0', () => {
  // Non-vacuity: if the parse above silently found nothing, every assertion
  // below would vacuously pass.
  it('parses a non-empty set of --p-* defaults from .stage', () => {
    const defaults = parseStageDefaults();
    expect(Object.keys(defaults).length).toBeGreaterThan(5);
  });

  it.each([false, true])('normal + reduced motion agree with the CSS default (reducedMotion=%s)', (reducedMotion) => {
    const defaults = parseStageDefaults();
    for (const { key, beats } of TRACKS) {
      const localProgress = localProgressForTrack(key, 0);
      const stageVars = computeStageBeats(beats, localProgress, reducedMotion);
      for (const [prop, expected] of Object.entries(stageVars)) {
        expect(
          defaults[prop],
          `--p-${prop} (track "${key}"): CSS default is ${defaults[prop]}, but ScrollDriver ` +
            `writes ${expected} at scroll position 0 (reducedMotion=${reducedMotion}). ` +
            `Hydration would flash from one to the other.`,
        ).toBe(expected);
      }
      // --p-track always exists for every track, independent of that track's
      // own beats map - make sure it was actually checked above rather than
      // silently absent from stageVars.
      expect(stageVars).toHaveProperty('track', localProgress);
    }
  });
});

describe('the no-JS stylesheet restores the finished story', () => {
  // Only the beats whose value actually differs between the start and the end
  // of the story need overriding: the rest already read correctly from the
  // .stage defaults the suite above pins. --p-tap is the reason this is a
  // difference rather than a plain "everything is 1" check - it is 0 at both
  // ends, so requiring it here would demand a redundant declaration.
  function overridesNeeded() {
    const needed = {};
    for (const { key, beats } of TRACKS) {
      const atStart = computeStageBeats(beats, localProgressForTrack(key, 0), false);
      const atEnd = computeStageBeats(beats, localProgressForTrack(key, 1), false);
      for (const [prop, endValue] of Object.entries(atEnd)) {
        if (atStart[prop] !== endValue) needed[prop] = endValue;
      }
    }
    return needed;
  }

  it('has beats that actually differ between the story start and end', () => {
    expect(Object.keys(overridesNeeded()).length).toBeGreaterThan(5);
  });

  it('declares every beat a no-JS visitor would otherwise see unplayed', () => {
    const noscript = parseNoscriptDefaults();
    for (const [prop, expected] of Object.entries(overridesNeeded())) {
      expect(
        noscript[prop],
        `public/hero-demo-noscript.css does not restore --p-${prop} to ${expected}. ` +
          `Without JavaScript nothing ever writes these, so a no-JS visitor would see ` +
          `the story frozen at its scroll-0 state instead of the finished one.`,
      ).toBe(expected);
    }
  });
});
