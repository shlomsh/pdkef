// The one registry of epics. generate-backlog.mjs (BACKLOG.md / TODO.md) and
// serve-backlog-board.mjs (the lane list) both read it, and validateTasks in
// backlog-data.mjs fails any task naming a key that is not here. It used to be
// two hand-copied lists, and the `site-quality` epic shipped registered in
// neither: QUAL-01..03 were silently dropped from both generated views and
// fell back to a raw key on the board, with nothing failing (ARCH-12).
//
// `heading` is the TODO.md heading. The compatibility index kept its original,
// longer headings when the monolithic TODO was split, and docs/ links to them.
export const epics = [
  { key: 'sign-tool-architecture', label: 'Sign tool architecture', heading: 'Sign Tool architecture review (2026-08-28)' },
  { key: 'editor-architecture', label: 'Editor architecture', heading: 'Editor module boundaries (architecture)' },
  { key: 'fonts-and-script-support', label: 'Fonts and script support', heading: 'Internationalization: fonts for scripts beyond Hebrew/Latin' },
  { key: 'landing-story-demo', label: 'Landing story and demo', heading: 'The landing story and demo' },
  { key: 'mobile-round-trip', label: 'Mobile round trip', heading: 'Mobile round trip: fill a form from a chat and send it back' },
  { key: 'site-quality', label: 'Site quality', heading: 'Site quality: accessibility, CSS correctness and theming' },
  { key: 'search-acquisition', label: 'Search acquisition', heading: 'Search acquisition: competitive keyword gaps' },
  { key: 'localized-search', label: 'Localized search', heading: 'Localized search: non-English query demand and localized tool pages' },
  // 2026-09-12 re-filing: every active SEO-*/LOC-* ticket moved out of the two
  // epics above into the five below, which answer "what can move today, what is
  // waiting and until when, what is gated". Done and retired tickets stay where
  // they were, so those two epics collapse into closed history.
  { key: 'seo-awaiting-read', label: 'Awaiting a read', heading: 'Shipped and waiting for a dated Search Console read (2026-10-08, then 2026-11-06/07/12)' },
  { key: 'english-base', label: 'English base', heading: 'Grow the English base: authority and on-page work that can move now, no new tool' },
  { key: 'new-tools-gated', label: 'New tools (gated)', heading: 'New tools, gated on the 2026-10-08 crawl read of the never-crawled nine (SEO-06)' },
  { key: 'hebrew-edition', label: 'Hebrew edition', heading: 'Hebrew: the one live localization experiment' },
  { key: 'localization-pilots', label: 'Localization pilots', heading: 'Localization pilots: one target-size page per language, no generic tool pages' },
];

export const statuses = [
  ['open', 'Open'],
  ['in_progress', 'In progress'],
  ['blocked', 'Blocked'],
  ['done', 'Done'],
  ['retired', 'Retired'],
];

export const priorities = ['P1', 'P2', 'P3'];

// Scheduling buckets. `unspecified` is what the TODO migration wrote for tasks
// that had none; keep it valid rather than inventing phases for old tickets.
export const phases = ['release-blocker', 'quick-win', 'near-term', 'longer-term', 'later', 'optional', 'unspecified'];

// An epic still has work while any task in it can still move. Done and retired
// tasks are history; an epic made only of history collapses out of the lane
// view and the top of BACKLOG.md so the board shows what is live.
export const ACTIVE_STATUSES = new Set(['open', 'in_progress', 'blocked']);

export function isEpicActive(key, tasks) {
  return tasks.some((task) => task.epic === key && ACTIVE_STATUSES.has(task.status));
}
