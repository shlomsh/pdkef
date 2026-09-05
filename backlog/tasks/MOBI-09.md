---
id: "MOBI-09"
title: "Give iOS its own entry path, stated in the product"
status: "open"
priority: "P2"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# MOBI-09 · Give iOS its own entry path, stated in the product

## Scope and acceptance

**iOS does not implement Web Share Target and is not going to, so a large part of the audience will
never get the share-sheet shortcut the rest of this epic is built around.** DEMO-03 recorded this
honestly and then left it there. The consequence is that on iPhone, the entire "get the form in" step
is undocumented: the tool shows a dropzone and a file picker, and the visitor is left to work out on
their own that the route is to save the PDF to Files first.

That route is genuinely short once known. Share the PDF out of WhatsApp or Mail, Save to Files, then
in PDkef tap Choose file: the iOS document picker opens on Recents and the file just saved is the top
item. Four taps, no install, works today. It only feels bad because nothing says it.

Add platform-detected guidance at the point of need, on the tool's own empty state rather than as
another card on the home page. One or two lines, in the product's ordinary voice, describing what to
do rather than apologising for a browser limitation or explaining Web Share Target to someone who does
not care.

Do not overclaim in either direction. The copy must not imply iOS gets the Android share-sheet path,
and must not imply iOS is second-class or broken, because for this flow it is neither: it is four taps
against three. Keep the existing "Add to Home Screen" guidance separate and about offline use, which
is what it is actually for.

**One option to decide rather than drift past.** An iOS Shortcut, published as an iCloud link, can
appear in the share sheet, save the PDF to Files and open `/sign/` in one action, collapsing the app
switch. It cannot hand bytes to the page, so the user still picks from Recents, and it is a
distribution artifact living outside the repo that someone has to keep working across iOS releases.
Decide it explicitly, with reasoning, and record the decision here either way.

**Acceptance.** On iOS Safari the Sign tool's empty state shows the Files route in at most two
sentences, and shows nothing of the sort on Android or desktop. The full path is walked on a real
iPhone and the real tap count recorded here, confirming the picker does open on Recents with the saved
file first. No copy anywhere on the site claims a share-target capability iOS does not have. The
Shortcut question is answered in this ticket rather than left open.
