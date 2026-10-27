/**
 * SNG-04: the one set of gesture constants.
 *
 * docs/sign-next-gen-guidelines.md §2.5: "All are in screen px and ms. None
 * scale with zoom." The machine owns these and no listener defines its own
 * threshold. Values are copied from the table as written, not invented.
 */

/** §2.5: slop before an element follows a finger. Touch only (§2.3: a mouse drags at once). */
export const SLOP_PX = 8;

/** §2.5: tap maximum duration (`TAP_HOLD_LIMIT_MS`, `DEFAULT_TAP_MAX_DURATION_MS`). */
export const TAP_MAX_DURATION_MS = 500;

/*
 * §2.5 values nothing reads yet (removed as unused exports, ARCH-130; the table in
 * docs/sign-next-gen-guidelines.md is their home): second-finger window 75 ms (PROPOSED; the
 * machine cancels a one-finger gesture whenever a second finger arrives before commit, which is
 * stricter), double-tap interval 400 ms (`DOUBLE_TAP_MS`, `toolArming.js`), reach to a detected
 * spot or its printed label 22 px ("half a fingertip"), minimum touch target 44 px (UX§8, Apple
 * HIG), handle hit area 44 px (PROPOSED) shrinking toward a 24 px floor so neighbouring handles
 * never overlap.
 */
