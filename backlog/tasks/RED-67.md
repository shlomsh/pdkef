---
id: "RED-67"
title: "A Redact tab left open across a deploy asks for a reload instead of a retry"
status: "done"
priority: "P1"
epic: "redact"
depends_on: []
---

# RED-67 · A Redact tab left open across a deploy asks for a reload instead of a retry

Filed 2026-10-22 from the daily error read.

## Why

On 22 Oct two Redact tabs still on 21 Oct builds (0b4b73e, 5acf929) asked for script chunks the
current deploy no longer serves. One pressed Download four times and got "Try again" each time, which
could never work; the other's saved-file check did not run after its download. Both reports were the
same cause: a lazy `import()` failing, once as Vite's "Unable to preload CSS", once as Safari's module
load error.

## Outcome

- `dropCause` reads Vite's "Unable to preload CSS" as `module_load`, like the browsers' own wording.
- When an export fails with `module_load`, Redact says "PDkef was updated while this page was open.
  Reload the page to continue. Your edits are kept." (the draft restores on reload).
- `CRITICAL_VERSION` 8 moves open tabs onto this build now.
- `docs/error-known-items.json` knows the export case as RED-67, `open`, because tabs can still outlive
  a deploy; MEM-12 is the signal for how often.
