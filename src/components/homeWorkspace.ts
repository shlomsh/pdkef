// The hero (header, file workspace, tool dock) and the live demo now share
// one canonical DOM tree at every breakpoint - see index.astro's markup and
// its .home-hero / .home-frame grids. Nothing here re-parents nodes any
// more; this module only handles behavior CSS cannot express: the offline
// anchor's idempotent scroll, the "back to workspace" shortcut, and the two
// scroll-driven visual states (which story card is pinned, and whether the
// mobile demo frame should show the fixed header/footer chrome).
const launcher = document.getElementById('home-files');
// The demo's own scroll track. Not #home-tour: that id now wraps the entire
// page (hero included - see the mobile grid-template-areas in index.astro),
// so its own top is pinned at document position 0 and can no longer signal
// "the demo has been reached". .demo-track is the element the pinned mobile
// frame actually travels through.
const demoTrack = document.querySelector<HTMLElement>('.demo-track[data-demo-track="mobile"]');
const offlineLink = document.querySelector<HTMLAnchorElement>('[data-offline-link]');
const offlineSection = document.getElementById('offline-app');
const cardStack = document.querySelector<HTMLElement>('.card-stack');
const homeFooter = cardStack?.querySelector<HTMLElement>('footer');
// Keep this in lockstep with the home page and demo responsive media queries.
const mobile = matchMedia('(max-width: 1023px)');

// index.astro's --home-nav-height default (calc(3.5rem + 0.5px)) is already
// correct for a real, GPU-rendered browser: AppBar.astro's h-14 row plus its
// border-b-[0.5px] hairline does render at 56.5px there, so this write lands
// the identical value and costs no post-paint shift for real visitors. It
// only actually corrects anything in an environment whose rendering
// disagrees with that constant - namely headless Chromium, which rounds the
// sub-device-pixel border up and renders the bar at 57px (see the comment on
// the CSS default in index.astro, and e2e/home/nav-height.spec.js). Kept to
// this one element only: read the bar's rendered height, then write it, so
// this never reads back a value it just wrote.
const homeBar = document.querySelector<HTMLElement>('[data-home-bar]');
function measureNavHeight() {
  if (!homeBar) return;
  const height = homeBar.getBoundingClientRect().height;
  document.body.style.setProperty('--home-nav-height', `${height}px`);
}
window.addEventListener('resize', measureNavHeight);
measureNavHeight();

document.querySelector('[data-workspace-return]')?.addEventListener('click', event => {
  event.preventDefault();
  launcher?.scrollIntoView({ behavior: 'instant', block: 'start' });
  document.querySelector<HTMLElement>('[data-home-picker]')?.focus({ preventScroll: true });
});

// The offline guide is a sticky story card. Native fragment navigation keeps
// attempting to align its nested heading's layout position, which changes as
// cards pin over each other; repeat clicks consequently nudged the page farther
// through the stack. Navigate to the card's fixed document offset instead, so
// this control is idempotent after the first click.
offlineLink?.addEventListener('click', event => {
  if (!offlineSection) return;
  event.preventDefault();
  const targetTop = Math.max(0, offlineSection.offsetTop - 16);
  if (Math.abs(window.scrollY - targetTop) > 1) {
    window.scrollTo({ top: targetTop, behavior: 'auto' });
  }
  if (window.location.hash !== '#offline-app') {
    window.history.replaceState(null, '', '#offline-app');
  }
});
// Let oversized cards flow instead of trapping their last lines in a pinned card.
const storyCards = [...document.querySelectorAll<HTMLElement>('.card-stack .card-reveal')];
function measureCards() {
  const desktopCards = matchMedia('(min-width: 1024px)').matches;
  // All reads happen before the one write below. Reading card.offsetHeight
  // in a loop that comes after a style write forces a synchronous reflow on
  // the first iteration; doing every read (including per-card) first, then
  // writing --home-footer-height once, then applying the attribute toggles
  // in a second pass keeps this to the layout the browser would do anyway.
  const fixedNavHeight = desktopCards
    ? document.querySelector<HTMLElement>('[data-home-bar]')?.getBoundingClientRect().height ?? 0
    : 0;
  const homeFooterHeight = homeFooter?.getBoundingClientRect().height ?? 0;
  const fixedFooterHeight = desktopCards ? homeFooterHeight : 0;
  const gap = parseFloat(getComputedStyle(document.documentElement).fontSize); // --stack-gap: 1rem
  const availableHeight = innerHeight - fixedNavHeight - fixedFooterHeight - (2 * gap);
  const overflowing = storyCards.map(card => card.offsetHeight > availableHeight + 1);
  document.body.style.setProperty('--home-footer-height', `${homeFooterHeight}px`);
  storyCards.forEach((card, index) => card.toggleAttribute('data-stack-overflow', overflowing[index]));
}
const cardObserver = new ResizeObserver(measureCards);
for (const card of storyCards) cardObserver.observe(card);
if (homeFooter) cardObserver.observe(homeFooter);
window.addEventListener('resize', measureCards);
measureCards();

// The footer frames the information deck, but should not float over the hero
// or its two demos. Its measured height is reserved above, so this visual-only
// state switch never moves the cards or changes their scroll positions.
let cardFramePending = false;
function updateCardFrame() {
  cardFramePending = false;
  if (!cardStack) {
    document.body.removeAttribute('data-home-cards-visible');
    return;
  }
  const stackBounds = cardStack.getBoundingClientRect();
  const navBottom = document.querySelector<HTMLElement>('[data-home-bar]')?.getBoundingClientRect().bottom ?? 0;
  const footerHeight = homeFooter?.getBoundingClientRect().height ?? 0;
  document.body.toggleAttribute(
    'data-home-cards-visible',
    stackBounds.top < innerHeight - footerHeight && stackBounds.bottom > navBottom,
  );
}
function scheduleCardFrameUpdate() {
  if (cardFramePending) return;
  cardFramePending = true;
  requestAnimationFrame(updateCardFrame);
}
window.addEventListener('scroll', scheduleCardFrameUpdate, { passive: true });
window.addEventListener('resize', scheduleCardFrameUpdate);
scheduleCardFrameUpdate();

// Mobile keeps the introductory hero (header, file workspace, tool dock) as
// a normal-flow first screen, then the demo frame pins and travels through
// its own tall track beneath it. Start the fixed header/footer chrome only
// once that track reaches the top of the viewport. Treating any intersection
// as "visible" promoted both bars while the landing hero was still on
// screen. On iOS in particular, 100svh can be shorter than innerHeight (and
// changes as browser chrome moves), so the next section could intersect by a
// few pixels at scrollY === 0. Making the app bar fixed then removed it from
// the hero's flow, pulled the heading underneath it, and fixed the footer
// over the home dock. The layout change reinforced its own intersection
// state, which is why rubber-banding the page only restored the landing view
// momentarily.
let demoFramePending = false;
function updateMobileDemoFrame() {
  demoFramePending = false;
  if (!demoTrack || !mobile.matches) {
    document.body.removeAttribute('data-home-demo-visible');
    return;
  }
  const trackBounds = demoTrack.getBoundingClientRect();
  document.body.toggleAttribute(
    'data-home-demo-visible',
    trackBounds.top <= 0 && trackBounds.bottom > 0,
  );
}
function scheduleMobileDemoFrameUpdate() {
  if (demoFramePending) return;
  demoFramePending = true;
  requestAnimationFrame(updateMobileDemoFrame);
}
window.addEventListener('scroll', scheduleMobileDemoFrameUpdate, { passive: true });
window.addEventListener('resize', scheduleMobileDemoFrameUpdate);
mobile.addEventListener('change', scheduleMobileDemoFrameUpdate);
scheduleMobileDemoFrameUpdate();
