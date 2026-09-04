---
id: "SIGN-24"
title: "Separate saved-signature assets from scalar preferences"
status: "done"
priority: "P1"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Done — 2026-09-04; signature assets moved to a separate versioned library"
---

# SIGN-24 · Separate saved-signature assets from scalar preferences

## Scope and acceptance

**The new versioned preference envelope stores saved signature image data beside every small
scalar preference.** `EditorPreferences.savedSignatures` contains up to ten base64 image data URLs,
and `setEditorPreference()` serializes the entire record for a font, color, direction, width, or pen
setting change. An uploaded image keeps its natural dimensions before PNG encoding, so one library
can be large enough to make ordinary preference clicks synchronously rewrite megabytes, broadcast
the same payload to other tabs, or hit localStorage quota. Callers currently ignore the boolean
write result, so a signature may appear saved for the current session but disappear after reload.

Keep the versioned user-scope and migration work from SIGN-11, but partition the signature library
from scalar preferences. Prefer an independently versioned record or IndexedDB asset store rather
than duplicating data URLs across settings writes. Cap or downsample uploaded images by measured
pixel/encoded size before persistence, report quota/storage failure without losing the in-memory
editor operation, and preserve existing legacy and schema-v1 records through migration. Same-user
tabs must still observe additions and deletions without transferring the signature payload for an
unrelated scalar change. Tests must prove that changing a scalar does not serialize signature image
bytes, oversized uploads follow the documented policy, quota failure is visible, migration retains
the library, and cross-tab deletion converges. Do not close SIGN-11 until this storage shape is
settled.

**Done (2026-09-04):** Scalar settings remain in the schema-v1 preference envelope while saved
signatures now use their own scoped, revisioned schema-v1 library record. Legacy keys and old
preference envelopes migrate the library before a scalar rewrite, so old libraries survive without
being copied into later font/color writes. The separate subscription channel retains deterministic
last-writer-wins convergence for additions and deletions. New images are re-encoded as PNG and
proportionally downsampled to 1 megapixel and 750 KB; the upload UI states that policy. A failed
library write keeps the signature usable in the current editor and announces that it will not survive
the next visit. Regression coverage pins scalar isolation, legacy/v1 migration, cross-tab deletion,
storage failure, and both image limits.
