import { readDraftMeta } from '../editor/workspace/draftStore.js';

// Presentation only. Never create, load, expire, or rewrite a document draft
// in response to scrolling. The editors remain the owners of their caches.
const root = document.documentElement;
const tour = document.getElementById('home-tour');
const finish = document.getElementById('try-workspace');
const header = document.querySelector<HTMLElement>('.home-header');
let complete = false;
try { complete = sessionStorage.getItem('pdkef:tour-complete') === 'yes'; } catch {}
const hasDraft = ['sign', 'redact'].some(tool => readDraftMeta(tool));
root.dataset.homeMode = complete || hasDraft ? 'workspace' : 'tour';

function finishTour() {
  complete = true;
  try { sessionStorage.setItem('pdkef:tour-complete', 'yes'); } catch {}
}
function showWorkspace() {
  finishTour();
  root.dataset.homeMode = 'workspace';
  window.scrollTo({ top: 0, behavior: 'instant' });
}
document.querySelector('[data-tour-skip]')?.addEventListener('click', showWorkspace);
document.querySelector('[data-workspace-return]')?.addEventListener('click', event => {
  event.preventDefault();
  showWorkspace();
  document.querySelector<HTMLElement>('[data-home-picker]')?.focus();
});
document.querySelector('[data-tour-replay]')?.addEventListener('click', () => {
  complete = false;
  try { sessionStorage.removeItem('pdkef:tour-complete'); } catch {}
  root.dataset.homeMode = 'tour';
  window.scrollTo({ top: 0, behavior: 'instant' });
});
function update() {
  if (!finish || !tour) return;
  // Position-derived so End, scrollbar jumps and keyboard scrolling count.
  // Defer collapse until the top is reached to keep the current scroll stable.
  if (finish.getBoundingClientRect().top < innerHeight - 124) finishTour();
  if (complete && scrollY <= 1) root.dataset.homeMode = 'workspace';
}
window.addEventListener('scroll', update, { passive: true });
window.addEventListener('pageshow', update);
// Header text may wrap with zoom or another font. Measure the real budget.
if (header) new ResizeObserver(() => {
  document.body.style.setProperty('--home-header-height', `${header.getBoundingClientRect().height}px`);
}).observe(header);
update();
