/** Where a floating overlay (the pill, the loupe) must live to be seen: the full screen
 * element, else the pseudo full screen workspace (iPhone Safari has no element full
 * screen, so the workspace goes fixed at z-index 9999 and covers body), else body.
 * One workspace exists per page, so a document query finds it. */
export function overlayHost(): HTMLElement {
  return (
    (document.fullscreenElement as HTMLElement | null) ??
    document.querySelector<HTMLElement>('[data-pseudo-fullscreen]') ??
    document.body
  );
}
