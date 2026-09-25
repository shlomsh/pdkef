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
  // 2026-09-13: the Merge tool review (Shlomi: an experience good enough that
  // people return and recommend it). Product work only; merge copy and SEO stay
  // closed under SEO-35.
  { key: 'merge-tool', label: 'Merge tool', heading: 'Merge: the tool people return to and recommend (2026-09-13 review)' },
  { key: 'localization-pilots', label: 'Localization pilots', heading: 'Localization pilots: one target-size page per language, no generic tool pages' },
  // Opened 2026-09-13 out of the CI-speed review: the Nx spike (branch
  // spike/nx) could not find the tools as modules because src/components is a
  // flat bag with import cycles, and the headless editor imports Preact
  // components. The boundaries are worth drawing on their own; scoped CI is
  // what falls out of them.
  { key: 'module-boundaries', label: 'Module boundaries', heading: 'Module boundaries: one folder per tool, an enforced dependency graph, Nx on top (2026-09-13)' },
  // Opened 2026-09-14 from the architecture review that closed the epic above
  // (docs/architecture-debt-review-2026-09-14.md): the places the layout still
  // lies about ownership, the narrowing fail-safes ARCH-20 left unenforced,
  // and the guidance and guards that drifted. Prioritized for the week of
  // 2026-09-15; the record holds the reasoning, the tickets the execution.
  { key: 'architecture-debt', label: 'Architecture debt', heading: 'Architecture debt: what the module-boundaries review found (2026-09-14)' },
  // Opened 2026-09-15 from Shlomi's read of the home page's "Open this instead?"
  // dialog: a file in PDkef is never final, so every opened file keeps its work
  // in the one recents memory space and the per-tool "draft" (the older half of
  // the store, one slot per tool) goes away with the warning that defended it.
  // Opened 2026-09-20 from the redo assessment. Undo shipped under SIGN-12 with
  // redo deferred as P3; the assessment found redo is cheap in Sign and Redact
  // (ActionHistoryEntry already carries whole-element snapshots for exactly this
  // reason) and that Edit Pages, the one destructive tool, has no undo at all.
  { key: 'undo-and-redo', label: 'Undo and redo', heading: 'Undo and redo across the tools (2026-09-20)' },
  { key: 'one-memory-space', label: 'One memory space', heading: 'One memory space: every opened file keeps its work, no drafts (2026-09-15)' },
  // Opened 2026-09-20 out of MOBI-10/11, which had grown past the epic holding
  // them: reading a flat form well enough to ask a person what it wants is its
  // own programme, not a step in the mobile round trip. The spike record
  // (docs/mobi-10-field-map-spike.md) is the evidence base - the on-device
  // geometry path, what a vision model can and cannot do, and the 90/90/85 gate
  // that separates a reviewable field map from a form that fills itself.
  // MOBI-11 moved here; MOBI-10 stays where it was decided, per the 2026-09-12
  // re-filing convention above.
  { key: 'form-understanding', label: 'Form understanding', heading: 'Form understanding: read what a form asks, ask the person, fill it back (2026-09-20)' },
  // Opened 2026-09-25 when Shlomi stopped the mobile patching: 34 MOBI tickets
  // in 76 days, each fix locally right and the next edge right behind it. The
  // record (docs/sign-next-gen.md) holds the pains, the four causes, the iOS
  // learnings, the competitor study and the plan; phone first, desktop on the
  // same architecture, Redact last.
  { key: 'sign-next-gen', label: 'Sign next generation', heading: 'Sign, next generation: one editor for phone and desktop (2026-09-25)' },
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
