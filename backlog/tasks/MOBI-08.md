---
id: "MOBI-08"
title: "Offer install at the moment it pays off, not in a card about working offline"
status: "open"
priority: "P2"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: ["MOBI-01"]
legacy_state: "Open"
---

# MOBI-08 · Offer install at the moment it pays off, not in a card about working offline

## Scope and acceptance

**The shortcut that collapses five steps into one only exists once the PWA is installed, and nothing
asks for that at a moment anyone would say yes.** The `share_target` in
`public/manifest.webmanifest` is what lets a PDF in a chat be sent straight into PDkef. Android only
offers an installed app in the share sheet, so for every visitor who has not installed, that entry
does nothing at all. The only install guidance on the site is a three-tab card on the home page framed
around working offline. Nobody installs a PDF site before they need one, and nobody who needs one goes
looking for an offline story first.

The moment worth asking is *after a completed share*: the person has just finished the long way round,
so the pitch is a true statement about what they have already done rather than a claim about a benefit
they have not felt. Capture `beforeinstallprompt`, hold it, and offer it there.

Copy rules from the product voice apply with unusual force here, because an install prompt is the most
nag-shaped thing on the site. Explain rather than sell, state the plain fact ("next time you can send
the PDF straight here from WhatsApp"), no urgency, no second ask if declined, and no framing that
implies a paid tier or an account. It is one line and a button, not an interstitial.

Two implementation constraints. Any script for this goes through Astro's bundling like
`BaseLayout.astro`'s service worker registration, never `is:inline`, or its hash is not in the
generated CSP and it is silently blocked in production while working perfectly in `npm run dev`. And
`beforeinstallprompt` is Chromium-only, so the prompt must be genuinely absent elsewhere rather than
degrading into a Safari-flavoured instruction sheet; iOS is MOBI-09's problem and must not be
half-answered here.

**This ticket is gated on MOBI-01.** Prompting people to install so they can use a path nobody has
ever run would be building on an assumption. If MOBI-01 finds the round trip broken, fix that first.

**Acceptance.** After a successful share on Chromium Android, a single unobtrusive install offer
appears with copy that names the concrete next-time benefit. Declining it does not ask again in that
session and does not ask on a later visit more than the stated policy allows, with that policy written
down here. Nothing appears on browsers without `beforeinstallprompt`. Verified through
`npm run build && npm run preview`, not `npm run dev`, because a CSP-blocked script looks identical to
a working one in dev. An installed instance then shows PDkef in the Android share sheet, which is the
outcome the whole ticket is for.
