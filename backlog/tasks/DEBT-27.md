---
id: "DEBT-27"
title: "Error reports carry the call chain and the page's situation, not just one frame"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "now"
order: 1
depends_on: ["DEBT-17"]
---

# DEBT-27 · Error reports carry the call chain and the page's situation, not just one frame

*Filed 2026-10-01.* DEBT-17 shipped reports of `{area, name, frame}`. Enough to count a defect, thin
for troubleshooting one: a single frame is where it threw, not how it got there, and nothing says
what the page was doing. Shlomi's call: the reports exist to troubleshoot, so carry a stack and
context, under the same rule - nothing from a document, no free text, every field a position in our
own code, a closed list, a bucket or a flag.

## Decision (2026-10-01)

- **stack**: every frame inside `/_astro/`, top first, at most 8, each `chunk.hash.js:line:col`.
  The top one stays the fingerprint the counts are keyed on.
- **step**: a label written at the call site (`thumbnail`, `export`, `load`...), an identifier.
- **tool**: the page's path (`/sign/`, `/he/sign/`), path only.
- **online**, **installed** (display-mode standalone), **sw** (a service worker controls the page),
  **age** (how long the page had been open, bucketed).
- **Still no message**: mapped through the source map, the column lands on the expression the
  message would have named, and the message is the one field that has ever leaked.
- **Storage**: counts unchanged, plus the latest full example per fingerprint per day, 90 days.
  `errors:read` shows it under each count; `errors:resolve` maps every frame of it.

## Acceptance

DEBT-27 owns the outcome, not a slice of it: an error like 2026-09-20's is tracked, reproduced and
fixed in a close loop, in production. Three tickets split off from DEBT-17 (DEBT-24, -25, -26) were
each a gap in that loop and are folded back in here.

The reports themselves:

- [x] Schema, browser reporter and endpoint carry the fields above and nothing else, adversarially
      tested as DEBT-17's were.
- [x] Every one of DEBT-17's 46 call sites passes a step.
- [x] `errors:read` shows a sample per fingerprint; `errors:resolve` maps a whole stack.
- [x] The endpoint stays silent on every failure (DEBT-17's test, kept green).
- [x] Disclosure updated wherever DEBT-17 disclosed, and still literally true.
- [x] Sabotage-checked in a production build and against the real store; reviewed fresh
      (`check:push` green on `9a0626ea`).

The loop, end to end:

- [ ] **Failures that throw nothing are visible too** (was DEBT-24). Two of the four ways Sign ends
      with no fields (`not_started`, `modules_unavailable`) never throw, so only Sign's maintenance
      events show them, and those went to Vercel custom events, which Hobby drops. They now go to
      `/api/report` and `errors:read` prints them by browser family.
- [ ] **The next swallowed error is a decision** (was DEBT-25): a CI ratchet on catches that neither
      report, rethrow nor say `// expected:`.
- [ ] **A flood cannot blind it** (was DEBT-26): a per-IP rate limit on `/api/report` at Vercel's
      firewall if Hobby has one; if not, recorded here with what stands instead.
- [ ] The drill passes again on the final code, not the code it first ran on.
- [ ] Real iOS Safari (Simulator, the broken build) delivers a report whose frames resolve to the
      cause, so the drill's one limit (Playwright WebKit keeps more async frames) is measured.
- [ ] After the push, a report sent to production lands in the live store and `errors:read` shows
      it; then it is deleted.

## The drill: would this have cracked the bug that started DEBT-17? (2026-10-01)

Shlomi's bar: the ticket is met only if an error like 2026-09-20's iOS detection failure can be
tracked, reproduced and fixed in a close loop. Replayed end to end:

1. **Break it as it broke.** A local branch put back the pre-`3840457a` text read
   (`getTextContent()`, which ends in pdf.js's `for await` over a `ReadableStream`). A production
   build ran in Playwright WebKit as an iPhone 15, with `ReadableStream`'s async iteration deleted
   in an init script - what iOS Safari lacks (WebKit bug 194379), and why no local run ever failed.
   Sign found **0 fields**, as on the iPhone.
2. **Track.** Within 7 s of opening the file one report left the page, went through the real
   endpoint code into the real store, and `errors:read` (0.5 s) showed it:
   `sign_form_detection · TypeError · ios-17`, step `detect_fields`, tool `/sign/`, four frames.
3. **Locate.** `errors:resolve -- <frames> --from <branch>` found the build and mapped the stack in
   7.7 s: `pdf.mjs:16040 for await (const value of readableStream)` ← `pdfTextItems.ts:34`
   `getTextContent()` ← `useFormFieldRegions.ts:173 readTextItems` ← `:267 pageTextRuns`.
   With the engine bucket, that is the whole diagnosis: this engine cannot async-iterate a stream.
4. **Reproduce.** The report names the missing capability, so deleting it in WebKit reproduces the
   failure on demand. `src/tools/sign/e2e/ios-text-stream.spec.js` now does that permanently.
5. **Fix and confirm.** The same drill against the fixed build: **10 fields, no report**.

On 2026-09-20 this took most of a day and five wrong theories; replayed, report to root cause is
about a minute. One honest limit: WebKit on a real device may keep fewer async frames than
Playwright's, but frame #1 alone already names the `for await` line. The drill entry was deleted
from the store afterwards.

