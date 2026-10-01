// The one registry of epics. generate-backlog.mjs (BACKLOG.md / TODO.md) and
// serve-backlog-board.mjs (the board) both read it, and validateTasks in
// backlog-data.mjs fails any task naming a key that is not here.
//
// Two kinds. The six `lanes` are the only epics a live ticket (open,
// in_progress, blocked) may use; they are the board, in display order. Every
// epic that existed before the board was reorganised stays registered as a
// closed (legacy) epic so done and retired tickets keep validating; they show
// only as counts under "Closed work".
export const lanes = [
  { key: 'redact', label: 'Redact: finish removal', why: 'Find covers exactly what it matched, Delete reaches every object, and the saved-file check can remove what it finds.' },
  { key: 'sign-fill-mode', label: 'Sign: finish fill mode', why: 'Fill mode is the default since SNG-19. Close the test gaps, then desktop parity, then retire the old editor.' },
  { key: 'form-detection', label: 'Form detector accuracy', why: 'Every detected spot is a stop in fill mode, so false positives reach people directly. One fix at a time, since each re-records the baselines.' },
  { key: 'robustness', label: 'Robustness and debt', why: 'Production errors you can see, small tools that clean up after themselves, and drafts whose limits people can see.' },
  { key: 'search-and-languages', label: 'Search and languages', why: 'Mostly waiting on dated Search Console reads. Two small things can ship now.' },
  { key: 'polish', label: 'Polish', why: 'Small, independent, good for a spare hour.' },
];

// Closed (legacy) epics. Row comments below record when and why each was opened.
const legacyEpics = [
  { key: 'sign-tool-architecture', label: 'Sign tool architecture' },
  { key: 'editor-architecture', label: 'Editor architecture' },
  { key: 'fonts-and-script-support', label: 'Fonts and script support' },
  { key: 'landing-story-demo', label: 'Landing story and demo' },
  { key: 'mobile-round-trip', label: 'Mobile round trip' },
  { key: 'site-quality', label: 'Site quality' },
  { key: 'search-acquisition', label: 'Search acquisition' },
  { key: 'localized-search', label: 'Localized search' },
  // 2026-09-12 re-filing: every active SEO-*/LOC-* ticket moved out of the two
  // epics above into the five below, which answer "what can move today, what is
  // waiting and until when, what is gated". Done and retired tickets stay where
  // they were, so those two epics collapse into closed history.
  { key: 'seo-awaiting-read', label: 'Awaiting a read' },
  { key: 'english-base', label: 'English base' },
  { key: 'new-tools-gated', label: 'New tools (gated)' },
  { key: 'hebrew-edition', label: 'Hebrew edition' },
  // 2026-09-13: the Merge tool review (Shlomi: an experience good enough that
  // people return and recommend it). Product work only; merge copy and SEO stay
  // closed under SEO-35.
  { key: 'merge-tool', label: 'Merge tool' },
  { key: 'localization-pilots', label: 'Localization pilots' },
  // Opened 2026-09-13 out of the CI-speed review: the Nx spike (branch
  // spike/nx) could not find the tools as modules because src/components is a
  // flat bag with import cycles, and the headless editor imports Preact
  // components. The boundaries are worth drawing on their own; scoped CI is
  // what falls out of them.
  { key: 'module-boundaries', label: 'Module boundaries' },
  // Opened 2026-09-14 from the architecture review that closed the epic above
  // (docs/architecture-debt-review-2026-09-14.md): the places the layout still
  // lies about ownership, the narrowing fail-safes ARCH-20 left unenforced,
  // and the guidance and guards that drifted. Prioritized for the week of
  // 2026-09-15; the record holds the reasoning, the tickets the execution.
  { key: 'architecture-debt', label: 'Architecture debt' },
  // Opened 2026-09-15 from Shlomi's read of the home page's "Open this instead?"
  // dialog: a file in PDkef is never final, so every opened file keeps its work
  // in the one recents memory space and the per-tool "draft" (the older half of
  // the store, one slot per tool) goes away with the warning that defended it.
  // Opened 2026-09-20 from the redo assessment. Undo shipped under SIGN-12 with
  // redo deferred as P3; the assessment found redo is cheap in Sign and Redact
  // (ActionHistoryEntry already carries whole-element snapshots for exactly this
  // reason) and that Edit Pages, the one destructive tool, has no undo at all.
  { key: 'undo-and-redo', label: 'Undo and redo' },
  { key: 'one-memory-space', label: 'One memory space' },
  // Opened 2026-09-20 out of MOBI-10/11, which had grown past the epic holding
  // them: reading a flat form well enough to ask a person what it wants is its
  // own programme, not a step in the mobile round trip. The spike record
  // (docs/mobi-10-field-map-spike.md) is the evidence base - the on-device
  // geometry path, what a vision model can and cannot do, and the 90/90/85 gate
  // that separates a reviewable field map from a form that fills itself.
  // MOBI-11 moved here; MOBI-10 stays where it was decided, per the 2026-09-12
  // re-filing convention above.
  { key: 'form-understanding', label: 'Form understanding' },
  // Opened 2026-09-25 when Shlomi stopped the mobile patching: 34 MOBI tickets
  // in 76 days, each fix locally right and the next edge right behind it. The
  // record (docs/sign-next-gen.md) holds the pains, the four causes, the iOS
  // learnings, the competitor study and the plan; phone first, desktop on the
  // same architecture, Redact last.
  { key: 'sign-next-gen', label: 'Sign next generation' },
  // 2026-09-27: what makes Redact genuinely better, picked from SITE-41's
  // follow-up list. RED-01 (real content removal) is the foundation the
  // WYSIWYG preview (RED-04) builds on, and Sign shares the engine.
  { key: 'redact-tool', label: 'Redact tool' },
];

export const closedEpics = legacyEpics.map((epic) => ({ ...epic, closed: true }));

export const epics = [...lanes.map((lane) => ({ ...lane, closed: false })), ...closedEpics];

export const statuses = [
  ['open', 'Open'],
  ['in_progress', 'In progress'],
  ['blocked', 'Blocked'],
  ['done', 'Done'],
  ['retired', 'Retired'],
];

export const priorities = ['P1', 'P2', 'P3'];

// When an open or in-progress ticket gets done. `now` is Up next, `next` is
// "Then, in order", `later` is Parked. Blocked tickets carry waiting_on instead.
export const HORIZONS = ['now', 'next', 'later'];

// Statuses a ticket can still move from. Done and retired are history.
export const LIVE_STATUSES = new Set(['open', 'in_progress', 'blocked']);
