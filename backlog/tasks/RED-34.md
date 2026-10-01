---
id: "RED-34"
title: "Redact toolbar you can read: words under every tool on touch and laptops, one icon per tool"
status: "done"
priority: "P1"
epic: "redact-tool"
depends_on: []
---

# RED-34 · Redact toolbar you can read: words under every tool on touch and laptops, one icon per tool

*UX review 2026-09-29.* Below 1300px (`SignToolbar.module.css`'s 1299px block) every Redact control is a
bare glyph, and Blur, Blackout and Whiteout are three look-alike bar icons. Guideline §7: "on touch the
word is always there or the control is not an icon."

- Redact's tool buttons (Blur, Blackout, Whiteout, Delete, Find) and Undo/Redo keep a short visible word
  at every width, phone included (word under the icon where the row is tight). Sign's toolbar is untouched.
- Blur, Blackout and Whiteout each get a distinct icon that shows its result.
- The Compress hand-off leaves the toolbar; it moves to the finish row (RED-36).
- The status slot takes a message from the island (export progress, done, an export cancelled by an edit).

## Acceptance

- At 375, 768, 1280 and 1440px every Redact tool shows its word; the row does not wrap past two rows on a phone.
- The three cover tools are told apart by icon alone in a screenshot.

## Result (2026-09-29)

Every Redact control keeps its word at every width (RedactToolbar.module.css overrides the shared 1299px hide for Redact only); Blur and Blackout have their own icons (toolIcons.tsx); Compress left the toolbar; the status slot takes the island's message (statusMessage). Phone: two rows of five, full screen reads Expand.
