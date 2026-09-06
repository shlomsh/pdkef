// Mobile gives the demo and file controls separate sections. Desktop always
// keeps the compact launcher beside a live, scroll-driven demo.
const tour = document.getElementById('home-tour');
const scene = tour?.querySelector('.home-scene');
const launcher = document.getElementById('home-files');
const finish = document.getElementById('try-workspace');
const header = document.querySelector<HTMLElement>('.home-header');
const mobile = matchMedia('(max-width: 760px)');
let seen = false;
try {
  seen = localStorage.getItem('pdkef:demo-seen') === 'yes' || sessionStorage.getItem('pdkef:tour-complete') === 'yes';
} catch {}
function arrangeSections() {
  if (!tour || !scene || !launcher) return;
  if (mobile.matches) {
    if (seen) tour.before(launcher);
    else tour.after(launcher);
  } else scene.prepend(launcher);
}
arrangeSections();
mobile.addEventListener('change', arrangeSections);
function rememberDemo() {
  if (seen || !finish || finish.getBoundingClientRect().top >= innerHeight) return;
  seen = true;
  try { localStorage.setItem('pdkef:demo-seen', 'yes'); } catch {}
  // Reorder on the next visit or explicit return, never during a scroll.
}
window.addEventListener('scroll', rememberDemo, { passive: true });
document.querySelector('[data-workspace-return]')?.addEventListener('click', event => {
  event.preventDefault();
  arrangeSections();
  launcher?.scrollIntoView({ behavior: 'instant', block: 'start' });
  document.querySelector<HTMLElement>('[data-home-picker]')?.focus({ preventScroll: true });
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
