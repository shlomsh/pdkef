// Phones keep the file workspace before the tour. On desktop the very same
// workspace joins the sticky scene so it stays beside the live demo. There is
// deliberately no stored "seen" state: every mobile visit has the same order.
const launcher = document.getElementById('home-files');
const tour = document.getElementById('home-tour');
const scene = tour?.querySelector('.home-scene');
const header = document.querySelector<HTMLElement>('.home-header');
const offlineLink = document.querySelector<HTMLAnchorElement>('[data-offline-link]');
const offlineSection = document.getElementById('offline-app');
const mobile = matchMedia('(max-width: 760px)');
function arrangeWorkspace() {
  if (!tour || !scene || !launcher) return;
  if (mobile.matches) tour.before(launcher);
  else scene.prepend(launcher);
}
arrangeWorkspace();
mobile.addEventListener('change', arrangeWorkspace);
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
  const headerHeight = header?.getBoundingClientRect().height || 0;
  const targetTop = Math.max(0, offlineSection.offsetTop - headerHeight - 16);
  if (Math.abs(window.scrollY - targetTop) > 1) {
    window.scrollTo({ top: targetTop, behavior: 'auto' });
  }
  if (window.location.hash !== '#offline-app') {
    window.history.replaceState(null, '', '#offline-app');
  }
});
// Header text may wrap with zoom or another font. Measure the real budget.
if (header) new ResizeObserver(() => {
  const height = `${header.getBoundingClientRect().height}px`;
  document.body.style.setProperty('--home-header-height', height);
  document.documentElement.style.setProperty('--home-header-height', height);
}).observe(header);

// Let oversized cards flow instead of trapping their last lines behind the dock.
const storyCards = [...document.querySelectorAll<HTMLElement>('.card-stack .card-reveal')];
function measureCards() {
  const headerHeight = header?.getBoundingClientRect().height || 0;
  for (const card of storyCards) {
    const gap = parseFloat(getComputedStyle(document.documentElement).fontSize); // --stack-gap: 1rem
    card.toggleAttribute('data-stack-overflow', card.offsetHeight > innerHeight - headerHeight - gap + 1);
  }
}
const cardObserver = new ResizeObserver(measureCards);
for (const card of storyCards) cardObserver.observe(card);
if (header) cardObserver.observe(header);
window.addEventListener('resize', measureCards);
