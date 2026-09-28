import { describe, expect, it } from 'vitest';
import { findAnimationShorthandViolations } from './check-animation-shorthand.js';

/* scripts/check-animation-shorthand.js's findAnimationShorthandViolations() is
   the pure detection this guard relies on: given raw CSS text, find every
   `animation:` shorthand declaration that hides a scroll/view timeline - the
   thing Lightning CSS folds a longhand `animation-timeline` into, which
   Chrome and Safari then drop the whole declaration for (see the script's own
   header comment and e7bb435a, the fix that shipped this shorthand bug to
   pdkef.com once already). */

describe('findAnimationShorthandViolations', () => {
  it('fails the exact minified shape that shipped the bug', () => {
    const css = '.x{animation:step-start both try-cue --try-card}';
    expect(findAnimationShorthandViolations(css)).toEqual(['animation:step-start both try-cue --try-card']);
  });

  it('fails a view() timeline function inside the shorthand', () => {
    const css = '.y{animation:try-cue 1s both view()}';
    expect(findAnimationShorthandViolations(css)).toHaveLength(1);
  });

  it('fails a scroll() timeline function inside the shorthand', () => {
    const css = '.z{animation:try-cue 1s both scroll(root)}';
    expect(findAnimationShorthandViolations(css)).toHaveLength(1);
  });

  it('passes a custom property carrying the whole shorthand', () => {
    const css = '.a{animation:var(--try-land,none)}';
    expect(findAnimationShorthandViolations(css)).toEqual([]);
  });

  it('passes var() references used as timing values, not timelines', () => {
    const css = '.b{animation:o-burst .9s var(--ease-out) var(--win-delay) both}';
    expect(findAnimationShorthandViolations(css)).toEqual([]);
  });

  it('passes a plain time-based shorthand with no timeline at all', () => {
    const css = '.c{animation:fade-in .3s ease-out}';
    expect(findAnimationShorthandViolations(css)).toEqual([]);
  });

  it('ignores animation-* longhands, only matching the shorthand property', () => {
    const css = '.d{animation-timeline:--try-card;animation-name:try-cue}';
    expect(findAnimationShorthandViolations(css)).toEqual([]);
  });
});
