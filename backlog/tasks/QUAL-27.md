---
id: "QUAL-27"
title: "Export reads as ready without anyone asking for it, on every draft restore"
status: "open"
priority: "P2"
epic: "polish"
horizon: "next"
depends_on: []
---

# QUAL-27 · Export reads as ready without anyone asking for it, on every draft restore

*Filed 2026-10-20. Shlomi, on a phone, 2026-10-19: "the doc draft is saved automatically so there is
no indication of the user intent to download or share. it happens briefly after loading."*

## Problem

Open a document that has saved work and do nothing. A beat after the page settles, the toolbar's
Share and Download turn solid teal on their own. Nothing was asked for and nothing was done; the
draft restored, `elementsCount` went above zero, and the controls that mean "finish" lit up.

Reproduced on the iPhone 17 Pro simulator, 2026-10-20: load `/redact/` with a restored draft, take no
action, and both controls are filled before you touch anything.

This is working as written. `.claude/rules/editor.md` settled on 2026-10-19:

> On a fresh file the row is quiet: tools, Replace and the disabled exports are all the plain button.
> Teal fill means one thing, ready: an armed tool or an export that can run.

Both halves of that sentence are honest on a fresh file, where the only way to make an export
runnable is to draw something. They come apart on a restore, where "can run" arrives by itself. The
fill then reads as a prompt rather than a state, and it is the loudest thing on a row whose other
eleven controls are quiet.

## Why it is not just a colour change

The rule is doing real work and should not be unpicked casually:

- The same teal marks an armed tool, which genuinely follows from a tap.
- Disabled Download and Share were deliberately dropped to the plain button on 2026-10-19 because
  "a disabled control that is the loudest in the row inverts the hierarchy". Whatever replaces the
  enabled state has to keep that fix.
- Sign and Redact share `EditorExportActions` and `SignToolbar.module.css`, so any answer lands in
  both. On a phone `SignToolbar.module.css`'s 919px block also fills `.share`, from when Share was
  the only export control there; `keepDownloadOnPhone` has since put Download beside it, so the
  phone toolbar now shows two filled controls side by side.

## Directions, none chosen

For whoever picks this up, with Shlomi deciding:

1. **Teal means a person did something.** An armed tool stays filled; export is the plain button
   until this session's first edit, then fills. Keeps the rule's spirit, costs a flag that a restore
   does not set.
2. **Export is never filled in the toolbar.** The toolbar is where you work; the completion row under
   the document is the call to action and is already the primary pair. Simplest, and it also settles
   the two-filled-controls-on-a-phone question.
3. **Leave it.** The fill is a true statement about state, and a person who restored a draft arguably
   wants to know they can finish. Say so in the rule and close this.

## Acceptance

- The chosen rule is written into `.claude/rules/editor.md` in the same change, replacing or
  qualifying the "teal fill means one thing, ready" line.
- A guard that opens a tool with a restored draft, does nothing, and asserts the toolbar's export
  controls are in the state the rule names.
- Sign and Redact assert the same thing, since they share the component.
- Shlomi sees it on his phone before it lands.
