---
id: "DEBT-17"
title: "We cannot see what breaks in production, and a day proved it"
status: "done"
priority: "P1"
epic: "robustness"
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

## Decision (2026-10-01)

Shlomi's first call was to extend the Vercel Analytics transport with a `client_error` event. Research
then showed the team is on **Hobby, which has no custom events** (DEBT-24), so the second call, also
his, was **a same-origin endpoint**: `/api/report`, a Vercel Function that counts reports in an
Upstash Redis store (free plan, auto-upgrade off, connected to pdkef via the Marketplace).
`connect-src 'self'` is untouched and the published sentence stays literally true: the browser only
ever talks to its own origin.

A report is three fields: `area` off a closed list, the error's `name`, and the top `/_astro/` frame.
**No message at all**, not even an engine one; the frame names the line. No build id either: builds
are deterministic and `sourcemap: 'hidden'` leaves every chunk byte-identical (measured), so the
chunk's content hash identifies the build and `npm run errors:resolve` rebuilds it to map the frame.

Rejected: Sentry-style vendors (a third-party `connect-src`), a self-hosted collector (more to run
for a question that is "what threw, where"), and encoding errors as fake page views (works on Hobby,
but abuses the page stats).

## Scope and acceptance

- [x] Decide the egress design, with `connect-src 'self'` held intact. Candidates, roughly in order
      of how well they fit: extend the existing same-origin maintenance transport with an error
      event; a same-origin tunnel endpoint that forwards to a self-hosted collector (note this
      needs a request-time component, and `middleware.ts` is the only precedent for one); a
      self-hosted open-source collector behind our own origin. Record the decision and the rejected
      options.
- [x] Whatever lands, the published promise must still be literally true afterwards. If it cannot
      be, stop and bring the trade to the owner rather than editing the sentence.
- [x] A shared, sanitised error reporter with `formDetectionDetail.ts`'s boundary as its floor:
      error name, engine-generated messages only, built-asset stack frames only, no document
      content, no filenames, no labels, no bytes. Adversarially tested, including the leak cases
      already recorded there.
- [x] Source maps, or the build ids to resolve a minified frame after the fact. A frame nobody can
      map is a frame nobody can act on.
- [x] Triage the 71 `} catch {` blocks. Not "add reporting to all" - decide per block whether its
      failure is expected (a preference that will not parse) or a defect (a detector that threw),
      and report only the second kind. Write the rule down so the next `catch` knows which it is.
- [x] It must never block, slow or break a tool, on any failure of its own, offline included.
      Everything here is best-effort by construction.
- [x] Disclose it before it ships, in `ANALYTICS.md` and `docs/maintenance-telemetry.md`, in the
      voice the rest of the privacy copy uses.
- [x] Sabotage-check it: break something on purpose, confirm the report arrives and says enough to
      act on. A reporter that cannot demonstrate a catch is the thing this ticket exists to prevent.

## Not in scope

Performance monitoring, session replay, any per-person identifier, and anything that would make a
document's contents leave the device. Replay in particular is off the table: it is a recording of
somebody's form.

## Evidence

The investigation is in this session's history; the mechanics and the sanitiser's two wrong turns
are in `src/tools/sign/formDetectionDetail.ts`'s docstring and `backlog/tasks/FORM-11.md`. The bug
that started it (fixed in `3840457a`, replayed end to end in DEBT-27's drill) was still unfixed when this was written: the detector throws
`TypeError: undefined is not a function` on iOS 26.6.2 and on no engine we can reproduce.

## Outcome (2026-10-01)

- **Reporter**: `src/lib/errorReport.ts` over the import-free `errorReportSchema.ts`, with
  `errorIdentity.ts` now shared with `formDetectionDetail.ts`. Production only, once per distinct
  report, ten per page, `sendBeacon`, never throws; uncaught errors from our own chunks are reported
  from every tool's shell.
- **Triage**: 152 catches, 106 expected, 46 defects, all 46 wired (`docs/debt-17-catch-triage.md`);
  the rule is "Catching errors" in `.claude/rules/tools-and-shell.md`. DEBT-25 makes it a guard.
- **Endpoint**: `api/report.ts` + `src/site-lib/errorReportStore.ts`: daily counts per area, name,
  frame and coarse browser family (`ios-26`), 90-day expiry, 5,000 a day cap, always 204.
  `npm run errors:read` prints them; `npm run errors:resolve -- <frame>` maps one to source.
- **Caught before shipping**: `vercel build` showed the function importing `errorIdentity.ts` at
  runtime, which would have failed every request; `functionImports.test.js` now guards it.
  `check:push` showed `import.meta.env` throwing at import under Node; read optionally now.
- **Sabotage-checked**, both ends. Server: the built function against the real store counted a valid
  report as `ios-26`, dropped one with an extra `message` field, refused GET (probe deleted after).
  Browser: a production build with its CSP, an uncaught TypeError from an `/_astro/` script on
  /sign/ and /merge/ sent exactly `{"area":"uncaught","name":"TypeError","frame":"sabotage.Zz9.js:1:42"}`
  once per page; a repeat, an error whose message held a form label but no `/_astro/` frame, and a
  marketing page sent nothing; no CSP violations.
- **Reviewed** by a fresh agent; its findings (a frame read from a V8 message line, cancellation and
  damaged-file noise, cross-area duplicates, a TypeError filter that hid the iOS bug class, endpoint
  hardening) are fixed. A forged flood can still use up the day's cap; DEBT-26 rate-limits it.
- **Disclosed** in `ANALYTICS.md`, `docs/maintenance-telemetry.md` (whose "10% random sample" claim
  was false and is corrected) and one sentence on the privacy page.

