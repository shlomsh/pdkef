// Source order is the mobile reading order: hero copy, workspace, launcher,
// then demo. Desktop reuses the same workspace beside the sticky live demo.
const launcher = document.getElementById('home-files');
const hero = document.querySelector<HTMLElement>('.home-hero');
const content = document.getElementById('home-content');
const tour = document.getElementById('home-tour');
const frame = tour?.querySelector<HTMLElement>('[data-demo-frame]');
const scene = tour?.querySelector('.home-scene');
const dock = document.querySelector('.home-dock');
const header = document.querySelector<HTMLElement>('.home-header');
const offlineLink = document.querySelector<HTMLAnchorElement>('[data-offline-link]');
const offlineSection = document.getElementById('offline-app');
const cardStack = document.querySelector<HTMLElement>('.card-stack');
const homeFooter = cardStack?.querySelector<HTMLElement>('footer');
// Keep this in lockstep with the home page and demo responsive media queries.
// The desktop demo needs two real columns for its caption and phone; narrower
// tablet widths use the safer single-column hero instead of squeezing either.
const mobile = matchMedia('(max-width: 1023px)');
function arrangeWorkspace() {
  if (!hero || !content || !tour || !frame || !scene || !launcher || !dock || !header) return;
  if (mobile.matches) {
    content.before(hero);
    frame.append(scene);
    hero.append(header, launcher, dock);
  }
  else {
    scene.prepend(launcher);
    hero.append(header, scene, dock);
    frame.append(hero);
  }
}
arrangeWorkspace();
mobile.addEventListener('change', arrangeWorkspace);
// Browser responsive modes do not all dispatch MediaQueryList changes at the
// same point in a viewport resize. The resize fallback keeps the toolbar and
// workspace out of the mobile demo even when that event is delayed or skipped.
window.addEventListener('resize', arrangeWorkspace);
// The desktop first fold is a normal-flow header, a full demo stage, and the
// in-flow tool rail. Measure only those local parts so their combined height
// fits the viewport; none of them is fixed or used as a page-wide offset.
function measureHeroStage() {
  const navHeight = document.querySelector<HTMLElement>('[data-home-bar]')?.getBoundingClientRect().height ?? 0;
  const headerHeight = header?.getBoundingClientRect().height ?? 0;
  const dockHeight = dock?.getBoundingClientRect().height ?? 0;
  document.documentElement.style.setProperty('--home-nav-height', `${navHeight}px`);
  document.documentElement.style.setProperty('--home-header-height', `${headerHeight}px`);
  document.documentElement.style.setProperty('--home-dock-height', `${dockHeight}px`);
  // The page stylesheet defines the defaults on body, so update that nearer
  // inheritance source as well. Updating :root alone leaves the tour reading
  // the fallback values and makes the stage too tall.
  document.body.style.setProperty('--home-nav-height', `${navHeight}px`);
  document.body.style.setProperty('--home-header-height', `${headerHeight}px`);
  document.body.style.setProperty('--home-dock-height', `${dockHeight}px`);
}
const heroObserver = new ResizeObserver(measureHeroStage);
if (header) heroObserver.observe(header);
if (dock) heroObserver.observe(dock);
measureHeroStage();
document.querySelector('[data-workspace-return]')?.addEventListener('click', event => {
  event.preventDefault();
  arrangeWorkspace();
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
  const fixedNavHeight = desktopCards
    ? document.querySelector<HTMLElement>('[data-home-bar]')?.getBoundingClientRect().height ?? 0
    : 0;
  const homeFooterHeight = homeFooter?.getBoundingClientRect().height ?? 0;
  const fixedFooterHeight = desktopCards ? homeFooterHeight : 0;
  document.body.style.setProperty('--home-footer-height', `${homeFooterHeight}px`);
  for (const card of storyCards) {
    const gap = parseFloat(getComputedStyle(document.documentElement).fontSize); // --stack-gap: 1rem
    const availableHeight = innerHeight - fixedNavHeight - fixedFooterHeight - (2 * gap);
    card.toggleAttribute('data-stack-overflow', card.offsetHeight > availableHeight + 1);
  }
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

// Mobile keeps the introductory hero in normal flow, then uses the real site
// navigation and footer to frame the long, pinned demo sequence beneath it.
let demoFramePending = false;
function updateMobileDemoFrame() {
  demoFramePending = false;
  if (!tour || !mobile.matches) {
    document.body.removeAttribute('data-home-demo-visible');
    return;
  }
  const tourBounds = tour.getBoundingClientRect();
  document.body.toggleAttribute(
    'data-home-demo-visible',
    tourBounds.top < innerHeight && tourBounds.bottom > 0,
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
