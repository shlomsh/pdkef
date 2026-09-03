---
id: "DEMO-04"
title: "Say it stays on your phone, in words a non-technical person believes"
status: "open"
priority: "P2"
epic: "landing-story-demo"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# DEMO-04 · Say it stays on your phone, in words a non-technical person believes

## Scope and acceptance

**This ticket previously specified a live network log, a running byte counter and the browser-enforced `connect-src 'self'` policy rendered on the page. That was wrong for this audience and is withdrawn.** It was designed to convince a developer reading a request waterfall. The people this product is for will never open DevTools, do not know what a request is, and would read a panel full of network jargon as a reason to be suspicious rather than reassured.

**What replaces it is stronger, because they can do it themselves in three seconds: airplane mode.** Turn off the connection and the tool still fills, signs, blurs and saves. That is not an explanation of privacy, it is a demonstration of it, and it needs no vocabulary at all. The service worker already makes it true.

Three pieces, all in plain language.

1. **The claim, once, in their words.** "Your document stays on your phone." Not "client-side", not "zero upload", not "no server". One sentence, no qualifier.
2. **The invitation.** A quiet line near the tool suggesting they turn on airplane mode and try it anyway. Anyone who does remembers this site. Anyone who does not still reads it as confidence.
3. **The live state.** `navigator.onLine` plus the `online`/`offline` events. When they actually are offline, say so and say everything still works. That is the moment the claim stops being marketing.

**What must not appear anywhere in this:** bytes, requests, network logs, Content-Security-Policy, `connect-src`, encryption, architecture diagrams, shield icons, padlocks, green checkmark badges, "military-grade", "bank-level". The voice rules in CLAUDE.md already forbid most of this; the ICP forbids the rest.

**The technical proof still has a home, just not here.** People who do want to verify are served by the repository being open and by the existing "Audit the code yourself" link. That is the right depth for them, and it costs the main surface nothing.

**Acceptance.** The claim and the invitation appear on the home page and on the Sign and Redact tool pages. The offline state is live, not simulated. Nothing in it blocks or delays processing. Reduced-motion and no-JS states are sensible. No new page-weight or CSS guard failures. Read every string aloud and cut any word a parent filling in a school form would not use.
