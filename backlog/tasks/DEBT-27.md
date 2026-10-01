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

- [x] **Failures that throw nothing are visible too** (was DEBT-24). Two of the four ways Sign ends
      with no fields (`not_started`, `modules_unavailable`) never throw, so only Sign's maintenance
      events show them, and those went to Vercel custom events, which Hobby drops. They now go to
      `/api/report` and `errors:read` prints them by browser family.
- [x] **The next swallowed error is a decision** (was DEBT-25): a CI ratchet on catches that neither
      report, rethrow nor say `// expected:`.
- [ ] **A flood cannot blind it** (was DEBT-26): a per-IP rate limit on `/api/report` at Vercel's
      firewall if Hobby has one; if not, recorded here with what stands instead.
- [x] The drill passes again on the final code, not the code it first ran on.
- [x] Real iOS Safari (Simulator, the broken build) delivers a report whose frames resolve to the
      cause, so the drill's one limit (Playwright WebKit keeps more async frames) is measured.
- [ ] After the push, a report sent to production lands in the live store and `errors:read` shows
      it; then it is deleted.

## The drill: would this have cracked the bug that started DEBT-17? (2026-10-01)

Shlomi's bar: the ticket is met only if an error like 2026-09-20's iOS detection failure can be
tracked, reproduced and fixed in a close loop. The root cause as captured (`3840457a`,
`src/lib/pdfTextItems.ts`): pdf.js's `getTextContent()` ends in `for await` over a `ReadableStream`,
which Safari has never supported (WebKit bug 194379), so on iOS 26.6.2 every document detected zero
fields with a `TypeError` while pages still rendered.

Replayed in **real Mobile Safari** (iOS 26.2 Simulator), nothing simulated, on the final code:

0. **Measured first.** iOS 26.2 Safari: `ReadableStream.prototype[Symbol.asyncIterator]` is
   `undefined`, and `for await` over a stream throws a `TypeError`. Its user agent says
   `iPhone OS 18_7 ... Version/26.2`: Apple froze the OS token, so the endpoint would have filed the
   September reports under `ios-18`. Fixed: `engineBucket` reads `Version/` (`349b1ec2`).
1. **Break it as it broke.** A throwaway branch put back the pre-`3840457a` read; a production build
   served with the real endpoint code in front of the real store. Sign rendered the page and found
   **0 fields**.
2. **Track.** Within 14 s one error report and one detection count left the page. `errors:read`
   (0.5 s): `sign_form_detection · TypeError · detect_fields · ios-26`, seven frames, plus
   `sign_form_detection · failure · processing_failed · ios-26` under Sign's events.
3. **Locate.** `errors:resolve` on those seven frames (10 s): frame #1 is
   `pdf.mjs:16040 for await (const value of readableStream)`, then `pdfTextItems.ts:33
   getTextContent()`, `useFormFieldRegions.ts:173 readTextItems`, `:267 pageTextRuns`. That is the
   recorded root cause, reached from the report alone. Three of Safari's async frames map to a
   function's first line rather than a call, so read the chain by its named calls.
4. **Reproduce.** The report names the engine and the `for await` line; iOS Safari reproduces it
   with no setup, and `src/tools/sign/e2e/ios-text-stream.spec.js` keeps it reproduced in CI by
   removing the same capability from Playwright's WebKit.
5. **Fix and confirm.** The final code in the same Safari: **10 fields, no error report**, one
   `success · six_to_twenty · ios-26` count.

On 2026-09-20 this took most of a day and five wrong theories; replayed, report to root cause is
about a minute. The drill's entries were removed from the store field by field (it is shared with
production), and the throwaway branch deleted.
