---
id: "DEBT-17"
title: "We cannot see what breaks in production, and a day proved it"
status: "open"
priority: "P1"
epic: "architecture-debt"
phase: "near-term"
depends_on: []
---

# DEBT-17 · We cannot see what breaks in production, and a day proved it

## Why

On 2026-09-20 the owner reported that Sign identified no fields on the PDkef practice form. The
detector finds 8 of its 9 fields, the scored corpus records 88.9% recall for that exact file, and
every environment available to an agent reproduced it correctly: desktop Chromium, Playwright
WebKit, a phone viewport, a private session, a local build, and production itself driven through a
real browser. The failure was real, on an iPhone running current iOS, and **it took most of a day
and five wrong theories to learn a single fact about it**: that the detector was throwing rather
than finding nothing.

Every one of those theories was cheap to hold and expensive to disprove, because nothing in the
running app could say what happened. Stale service-worker bundle, a missing browser API, a CSP
header, a chunk 404, a precondition bail - each had to be eliminated by argument and local
experiment. The one fact that ended the guessing came from shipping a diagnostic mid-investigation.

**The specific hole is not one hook.** `useFormFieldRegions.ts` swallowed its error by design, with
a defensible docstring: a feature nobody asked for should not raise an error at them. The
reasoning is sound and the consequence is that "detection crashed" and "this PDF has no fields"
were indistinguishable from outside, including to the person debugging it.

`grep -rn "} catch {" src/` returns **71 blocks that discard the error entirely**, across
`FileDropzone`, `RecentFiles`, `SignatureDialog`, `preferenceStore`, `liveFontCoverage`,
`PdfSplitTool`, `sign.js` and more. Most are correct as local behaviour: a preference that will not
parse should fall back to a default, not break a page. All 71 are invisible in aggregate. We do not
know whether any of them fires for real people, or how often, or on which browser.

The product is 100% client-side, so there is no server log to fall back on. **Nothing that happens
on a person's device is observable to us at all**, by construction.

## The constraint this lives under, and why it is not negotiable

`connect-src 'self'` is not only an invariant in CLAUDE.md. It is a **published promise**, in the
site's own marketing copy (`src/data/staticPages.js`):

> "PDkef ships a strict Content-Security-Policy that locks connect-src down to the site's own
> origin, so the browser itself blocks any script from sending data to a third-party server, even
> if a future bug tried to add one by accident."

and on `/open-source-pdf-editor/`. A conventional Sentry or GlitchTip integration posts to a
third-party origin and would require widening `connect-src`, which **breaks that sentence**.
Retracting it to get error reports would be a bad trade and is not what this ticket proposes.

So the design question is not "which vendor". It is: **how does an error reach us without a
third-party origin appearing in `connect-src`?**

## Prior art already in the repo

- **A same-origin transport exists.** `src/lib/maintenanceTelemetry.ts`'s `vercelMaintenanceTransport`
  already reports anonymous, allowlisted maintenance events, and `ANALYTICS.md` and
  `docs/maintenance-telemetry.md` already disclose them. Extending a closed event list is the
  cheapest path that keeps the promise intact.
- **The sanitising is solved, and it was got wrong twice first.**
  `src/tools/sign/formDetectionDetail.ts` (FORM-11) is the worked example. Both mistakes are worth
  reading before anyone writes a second reporter:
  - an error's *message* is not safe. A library builds messages out of what it choked on, so
    `obj[valueReadFromThePdf]` puts a field label inside a `TypeError`. Three real leaks -
    a field label, a line of page text and a filename - reached a prefilled **public** issue body
    before an adversarial pass caught them.
  - over-redacting is also a failure. The first tightening stripped the one token that identified
    the failing call, and cost two round trips with the device before the approach changed.
  - what worked: the **top stack frame**, matched strictly inside `/_astro/`. It is a position in
    our own built output, it cannot contain anything from a document, and it names the line.
- **The four-state shape is worth reusing**: never ran (and which precondition was unmet), modules
  could not load, ran and threw, ran and found nothing. Collapsing those into "failed" is what made
  this bug opaque.

## Scope and acceptance

- [ ] Decide the egress design, with `connect-src 'self'` held intact. Candidates, roughly in order
      of how well they fit: extend the existing same-origin maintenance transport with an error
      event; a same-origin tunnel endpoint that forwards to a self-hosted collector (note this
      needs a request-time component, and `middleware.ts` is the only precedent for one); a
      self-hosted open-source collector behind our own origin. Record the decision and the rejected
      options.
- [ ] Whatever lands, the published promise must still be literally true afterwards. If it cannot
      be, stop and bring the trade to the owner rather than editing the sentence.
- [ ] A shared, sanitised error reporter with `formDetectionDetail.ts`'s boundary as its floor:
      error name, engine-generated messages only, built-asset stack frames only, no document
      content, no filenames, no labels, no bytes. Adversarially tested, including the leak cases
      already recorded there.
- [ ] Source maps, or the build ids to resolve a minified frame after the fact. A frame nobody can
      map is a frame nobody can act on.
- [ ] Triage the 71 `} catch {` blocks. Not "add reporting to all" - decide per block whether its
      failure is expected (a preference that will not parse) or a defect (a detector that threw),
      and report only the second kind. Write the rule down so the next `catch` knows which it is.
- [ ] It must never block, slow or break a tool, on any failure of its own, offline included.
      Everything here is best-effort by construction.
- [ ] Disclose it before it ships, in `ANALYTICS.md` and `docs/maintenance-telemetry.md`, in the
      voice the rest of the privacy copy uses.
- [ ] Sabotage-check it: break something on purpose, confirm the report arrives and says enough to
      act on. A reporter that cannot demonstrate a catch is the thing this ticket exists to prevent.

## Not in scope

Performance monitoring, session replay, any per-person identifier, and anything that would make a
document's contents leave the device. Replay in particular is off the table: it is a recording of
somebody's form.

## Evidence

The investigation is in this session's history; the mechanics and the sanitiser's two wrong turns
are in `src/tools/sign/formDetectionDetail.ts`'s docstring and `backlog/tasks/FORM-11.md`. The bug
that started it was still unfixed when this was written: the detector throws
`TypeError: undefined is not a function` on iOS 26.6.2 and on no engine we can reproduce.
