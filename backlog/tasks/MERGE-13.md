---
id: "MERGE-13"
title: "A merge survives a crash: the file set and page edits saved on device, restored on return"
status: "open"
priority: "P1"
epic: "merge-tool"
phase: "near-term"
depends_on: ["MERGE-09"]
legacy_state: "Open"
---

# MERGE-13 · A merge survives a crash: the file set and page edits saved on device, restored on return

*Filed 2026-09-13* from the Merge review; Shlomi's "cherry on top". Draft persistence is the flagship
feature on Sign and Redact (`project_draft_persistence_feature`); Merge gets the same promise.

## Scope and acceptance

Every change to the list or the pages saves a draft to IndexedDB through `draftStore.js`: the files
(name, type, bytes), the page map from MERGE-09, and the options. A browser crash, a tab closed by
mistake or a phone that killed the tab in the background brings the person back to exactly where they
were: `BasePdfTool`'s `checkingDraft` placeholder, then the list and strip restored, with the "Draft
saved" chip the shell already renders.

**What has to change in the store.** `saveDraft` holds one `fileBytes` and derives `sourceId` from
it. Merge needs a multi-file record. Extend the record with a `files` array and derive the source id
from the ordered file hashes, keeping revision and writer-conflict handling as they are (SIGN-11's
versioned persistence applies). Do not fork the store.

**Limits, stated honestly.** A merge set can be hundreds of megabytes. Saving is best-effort with a
size cap decided in this ticket (start at 200 MB and measure quota behaviour on iOS Safari, which is
the constraint); above it the chip reads "Draft not saved: set too large for this browser" using the
existing `error` save state, and the tool keeps working. Drafts expire after 14 days like Sign's. The
FAQ entry about drafts and shared devices on `/sign/` gets a sibling on `/merge/`.

**Pre-paint.** The inline script in `ToolPageLayout.astro` already looks up
`pdf-toolkit:workspace:has-draft:merge`; setting that hint makes the hero pre-collapse for free. The
home page resume card (`readDraftMeta`, `RecentFiles`) must show a merge draft with the first file's
preview and the page count.

**Acceptance.**

- Kill the tab mid-edit (Playwright: close the page, reopen `/merge/`) and the same files, order,
  rotations, skips and options come back; the "Draft saved" chip reflects the real save state (SIGN-06).
- Oversized set degrades to the honest chip, tool unaffected.
- Clear all deletes the draft and the hint; the home page card disappears.
- Unit tests for the multi-file record round-trip and size cap; one Playwright restore check.
