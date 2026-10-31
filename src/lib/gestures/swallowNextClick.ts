/** Swallow the click that follows a mouse press whose gesture was already handled (a whiteout
 * eyedropper pick, a highlight swipe), so a page-level click handler (deselect on blank page,
 * fill mode's tap-to-add) does not act on it. It is dropped when it swallows the click, or after
 * the next mouseup plus a tick (a press that never produces a click). No fixed timer, so a long
 * press still swallows its own click and no later click is ever eaten. On touch, preventDefault
 * on touchstart already suppresses the click. */
export function swallowNextClick() {
  const onClick = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    cleanup();
  };
  const onUp = () => {
    window.removeEventListener('mouseup', onUp, true);
    setTimeout(cleanup, 0);
  };
  function cleanup() {
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('mouseup', onUp, true);
  }
  window.addEventListener('click', onClick, true);
  window.addEventListener('mouseup', onUp, true);
}
