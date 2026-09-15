---
id: "MEM-01"
title: "The store: one recents memory space, work saved per file, the per-tool draft folded in"
status: "in_progress"
priority: "P1"
epic: "one-memory-space"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# MEM-01 · The store: one recents memory space, work saved per file, the per-tool draft folded in

*Filed 2026-09-15.* Shlomi, reading the home page's "Open this instead?" dialog: "the concept of draft
is legacy. The file is always in edit-available mode and is never final. On a crash or a break the
user can always come back and continue editing; even download or share does not mean final from
PDkef's perspective. It should all be kept in the same memory space."

## Why the draft is an artefact, not a concept

`src/lib/drafts/draftStore.js` holds two things in one IndexedDB object store (`pdf-toolkit-workspace`,
store `workspace`): a **draft**, one record per tool under the key `sign` / `redact` / `merge`
(source bytes + `elements` + `extra` + `sourceId`, 14-day expiry), and **recents**, up to six source
PDFs under `recent:<content hash>` (bytes + preview + the tool that used them last, an index in
localStorage). The draft came first (`24ad2d5`); recents were added beside it later, "deliberately a
separate cache" (draftStore.js, above `RECENT_FILES_META_KEY`). The split means a file being edited is
stored twice, and it is the only reason the home page has to warn: opening recent file B in Sign
overwrites the single Sign draft that holds A's signatures.

Fold the two: a recent entry is the unit, and it carries the work.

## Scope

**Entry.** Keyed by content hash as today (`sourceIdForBytes`; `sourceIdForFiles` for a Merge set).
Holds the source (one `fileBytes`, or Merge's `files` array), `preview`, `savedAt`, and the work done
on it, per tool, so the same PDF signed and then redacted keeps both: `work: { sign: { elements,
extra, revision, writerId, updatedAt }, redact: {...} }`, or Merge's `{ plan, options }`. `tool` stays
the tool that touched it last, which is where a home-page tile opens. Revision / writerId / the
cross-tab `draft-change` conflict signal (SIGN-11) move from "per tool" to "per entry and tool";
the logic is unchanged, only the key is.

**Save.** `useDraftPersistence` and `useMergeDraft` write into the entry instead of the tool slot.
Opening a file already creates its entry (today `cacheRecentFile` does this from the preview effect);
autosave adds the work. Nothing else changes in the save cadence (700 ms debounce, pagehide flush).

**Resume.** `/sign/` opened directly restores the last entry used in Sign. That is a per-tool pointer
(`pdf-toolkit:workspace:current:<tool>` → entry id) plus the existing pre-paint hint; `hasDraftHint`,
`readDraftMeta` and the blocking script in `ToolPageLayout.astro` read the pointer's entry instead
of a per-tool metadata key. `takeHandoff` / `saveHandoff` stay as they are (5-minute records under
`handoff:<tool>`); a hand-off sets the pointer.

**Eviction.** Today a draft dies by age (14 days) and a recent by count (six). Merged, the rule is
recency only: six entries, the seventh evicts the least recently opened, whether or not it carries
edits. Shlomi's reasoning (2026-09-15): someone opens a form, reads what it asks for, goes to fetch
the data, and comes back to the home page to continue the file they started, even though nothing in
it changed yet. An untouched file is as much "in progress" as an edited one, so the store must not
rank them. Age expiry stays at 14 days for every entry (`draftPolicy.js`, one `savedAt`, never a
frozen `expiresAt`). Write this rule down in the store's header comment; it is the one place a file
can still drop out and it must be deliberate.

**Migration.** On first open of the new store, an existing per-tool draft folds into
`recent:<its sourceId>` (it already carries `sourceId`; if the entry exists, attach the work to it,
otherwise create it from the draft's bytes), the per-tool key and its `has-draft` / `draft-meta`
localStorage keys are deleted. No IndexedDB version bump (Safari's blocked-`open()` hazard in the
header comment still applies); the migration is a read-modify-write inside the same schema.

**Storage.** A file being edited was held twice (draft bytes + recent bytes). It is now held once.
Merge's `MERGE_DRAFT_MAX_BYTES` (200 MB) applies to the entry.

## Acceptance

- Unit: round-trip of an entry with work for two tools on the same bytes; eviction is by recency
  alone (an untouched entry outlives an edited older one); expiry; the migration from a per-tool draft (both shapes) is exercised.
- The store's API surface is re-read against its ~30 importers (`grep -rl draftStore src`) and each
  caller updated in MEM-02 / MEM-03; this ticket owns the store, `draftPolicy.js`, the migration and
  the pointer.
- `.claude/rules/tools-and-shell.md`'s "Draft persistence" section and CLAUDE.md's one-line mention
  ("on-device IndexedDB draft persistence") are rewritten to the new model; `npm run check:guidance`.
- Every byte stays on the device; `connect-src 'self'` is untouched (`npm run test:csp`).
