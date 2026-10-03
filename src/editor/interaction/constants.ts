/**
 * SNG-04: the one set of gesture constants.
 *
 * docs/sign-next-gen-guidelines.md §2.5: "All are in screen px and ms. None
 * scale with zoom." The machine owns these and no listener defines its own
 * threshold. Values are copied from the table as written, not invented.
 */

/** §2.5: slop before an element follows a finger. Touch only (§2.3: a mouse drags at once). */
export const SLOP_PX = 8;

/**
 * §2.5, PROPOSED (the owner has not ruled; SNG-03 sets it): the second-finger
 * window before any visible move. Declared here so the router has one place to
 * read it. The machine itself does not use it: it cancels a one-finger gesture
 * whenever a second finger arrives before commit (§2.2), which is stricter.
 */
export const SECOND_FINGER_WINDOW_MS = 75;

/** §2.5: tap maximum duration (`TAP_HOLD_LIMIT_MS`, `DEFAULT_TAP_MAX_DURATION_MS`). */
export const TAP_MAX_DURATION_MS = 500;

/** §2.5: double-tap interval (`DOUBLE_TAP_MS`, `toolArming.js`). Not used by the machine yet. */
export const DOUBLE_TAP_MS = 400;

/** §2.5: reach to a detected spot or its printed label ("half a fingertip"). Not used by the machine yet. */
export const SPOT_REACH_PX = 22;

/** §2.5: minimum touch target (UX§8, Apple HIG). */
export const MIN_TOUCH_TARGET_PX = 44;

/** §2.5, PROPOSED: handle hit area, shrinking toward a floor so neighbouring handles never overlap. */
export const HANDLE_HIT_PX = 44;
export const HANDLE_HIT_FLOOR_PX = 24;
