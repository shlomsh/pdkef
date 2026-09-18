---
id: "SEO-36"
title: "One privacy vocabulary across the ten tool pages and the hero: each phrase gets one job, the intensifiers go"
status: "done"
priority: "P2"
epic: "english-base"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# SEO-36 · One privacy vocabulary across the ten tool pages and the hero: each phrase gets one job, the intensifiers go

*Filed 2026-09-19* from a read-through Shlomi asked for: "some use 'on your device', others 'in your
browser', others nothing at all." The inventory below was pulled verbatim from `src/data/tools.js`
and `src/data/homeContent.js` at `a3b70114`, then checked by hand.

## What the inventory found

Every one of the eleven pages uses all three phrasings somewhere ("in your browser", "on your device",
"never uploaded to a server"), so the problem is not that a phrase is missing from a page. It is that
the same phrase means different things on different pages, the first-screen copy is uneven, and seven
strings say things the positioning protocol (findings doc, section 7) says we never say.

**First screen (h1 + subhead), the part Google snippets when it discards our meta:**

| Page | h1 carries | subhead carries |
| --- | --- | --- |
| `/sign/` | "in Your Browser" | "Free, open source, and your document stays on your device." |
| `/redact/` | nothing | "Free, open source, and your file stays on your device." |
| `/merge/` | "In Your Browser" | nothing (the merge-only note under the hero carries "Nothing is uploaded") |
| `/split/` | "in Your Browser" | nothing |
| `/compress/` | nothing | "Private: your file never leaves your device." |
| `/compress-image/` | nothing | "Private: your photo never leaves your device." |
| `/pdf-to-image/` | nothing | "nothing uploaded" |
| `/image-to-pdf/` | nothing | nothing |
| `/unlock/` | nothing | nothing |
| `/edit-pdf/` | nothing | nothing |
| `/` | "on your device" | "nothing leaves your device" |

**Never-say and intensifier hits** (section 7's table plus voice principle 3, "plain facts over
intensifiers"):

| String | Where |
| --- | --- |
| `100%` (7 times: "100% private", "100% on your device", "100% client-side") | pdf-to-image desc; unlock desc + FAQ; edit-pdf desc; image-to-pdf, split, compress, compress-image FAQ |
| `Secure, fast, and 100% private in-browser conversion.` | pdf-to-image desc |
| `Is the PDF compression secure?` / `Is protecting or unlocking a PDF here secure?` | compress FAQ, unlock FAQ |
| `Transparent & Secure` | home, privacy section kicker |
| `guaranteeing total privacy` | split FAQ |
| `client-side` (jargon, 4 times) | split, compress, compress-image, unlock FAQ |
| `instantly` (4 times) | merge desc, image-to-pdf desc, split step 4, edit-pdf step 3 |
| `Free Forever` (the exact never-say phrase) | home, founder-story pill |

No em dash, no competitor name, no "free tier", no "military-grade" anywhere. The one "unlike" is the
Sign FAQ comparing Korean to Chinese script, not a competitor dig.

**Lengths:** descriptions on `/` (193), `/edit-pdf/` (179), `/sign/` (159) and `/compress-image/`
(155) run past what a SERP shows. Titles are all 52 to 63 characters; `/image-to-pdf/` at 63 is the
one likely to clip.

## The rule: one job per phrase

The chrome already chose the vocabulary: the app-bar badge says "On-device", the empty state says
"Private. Files never leave your device.", the trust chip says "Works offline", and SEO-34 put "run on
your device" in the home title and h1. The tool pages should say the same thing the chrome does.

| Phrase | Its job | Where it belongs |
| --- | --- | --- |
| **on your device** | Where the work runs. The canonical claim. | h1 if any privacy phrase is in the h1; `aboutLead`; `freeNoteLead` ("because it runs on your device...") |
| **stays on your device** / **never leaves your device** | The consequence a person cares about. | The subhead's closing sentence; the FAQ answer |
| **in your browser** | The mechanism. Only where it explains something (no install, no app, no server to pay for). Never as the privacy claim by itself: an upload site also runs "in your browser", and it is the phrase every incumbent uses, so it carries no differentiation. | `aboutLead`'s "right in your browser, no upload, no server" is fine because the next sentence states the claim; drop it from h1s |
| **No upload** / **nothing is uploaded** | The negation, short. | Description tag; step 1 |
| **Works offline** | The proof. Section 2 (LOC-15): the on-device claim is copyable in words and has been copied in four languages; only the demonstrable behaviour is not. | Once per page, honestly worded (redact's FAQ has the model: "install PDkef and let its required assets load while connected") |

Never: "100%", "secure" as a privacy claim ("protect" stays as Unlock's verb), "client-side", "guaranteeing", "instantly", "Free Forever".

**One subhead closer for every tool page:** `Free, open source, and your file stays on your device.`
(noun varies: document, photo, images). Nine words, three of the four claims, and section 3.6 marks open
source as underused. Sign and Redact already have it; Compress's "Private: your file never leaves your
device." says the same thing and can either stay or align, Shlomi's call.

**One FAQ answer to "Are my files uploaded to a server?":** `No. Nothing is uploaded. The tool runs on
your device, in your browser, and your <files> never leave it. There is no processing server. For
offline use, install PDkef and let its required assets load while connected.` (FAQ answers render as
plain text, no links.)

## Measurement conflicts: what a change now would contaminate

The findings doc's 2026-10-08 read has several pages under measurement. A copy change before then is
a second variable in that read, and one page is a control.

| Page | Pending read | Verdict on touching it now |
| --- | --- | --- |
| `/unlock/` | SEO-28's **only clean control** (never requested, still crawled 08-21) | **Do not touch before 2026-10-08.** Its two "100%" and "secure" FAQ hits wait. |
| `/merge/` | SEO-35: "title and h1 gain combine, nothing else"; SEO-28 control (already contaminated by hreflang) | Leave title and h1. Description's "instantly" is safe to fix; the read is position, not CTR. |
| `/sign/` | SEO-07: CTR vs 2.38% after the 09-11 title change | Leave title and h1 ("in Your Browser" stays until the read). Nothing else on the page needs a change. |
| `/redact/` | SEO-04: CTR on thirteen queries, already carrying the 09-17 Blur reorder as a second variable | **No change.** It is already the cleanest page. |
| `/split/` | SEO-09: extract-cluster position after recrawl | FAQ fix is safe (position read on "extract" words, which stay). h1's "in Your Browser" can wait for the read or go now; either way the extract words stay. |
| `/compress/`, `/compress-image/` | SEO-05, SEO-33: position at the page-one boundary, not CTR | FAQ fixes safe. Subhead already canonical. |
| `/pdf-to-image/`, `/image-to-pdf/`, `/edit-pdf/` | never crawled (SEO-06); indexing requested 09-10, cannot be re-requested | **Free to change**, and they carry the worst strings. |
| `/` | SEO-34: impressions on `pdf tools`, driven by title/h1 | Title and h1 stay. Description trim, "Free Forever" pill and "Transparent & Secure" kicker are safe. |

## Shipped 2026-09-19

Shlomi's calls on the two open questions: `/unlock/` gets fixed now (it receives no traffic, so
SEO-28 loses its clean control; noted there), and the three h1s change now rather than after the read.
`/redact/` stays untouched: it carries most of the site's traffic and is mid-read on CTR.

Applied in `src/data/tools.js` and `src/data/homeContent.js`, every string exact:

- **h1s**: Sign `Sign PDF Online Free: Fill & Sign Forms`, Merge `Merge or Combine PDF Files Online
  Free`, Split `Split PDF Online Free: Extract Pages` (each dropped "in Your Browser" and gained the
  "online" the title already had; `h1Accent` is `Online Free` on all three, matching the other tools).
  Titles untouched everywhere.
- **Subhead closer** `Free, open source, and your file stays on your device.` (files / images / photo)
  added on merge, pdf-to-image, image-to-pdf, split, unlock, edit-pdf; swapped in for "Private: your
  file never leaves your device." on compress and compress-image. Sign already had it.
- **Upload FAQ**, one answer on eight pages: `No. Nothing is uploaded. The tool runs on your device,
  in your browser, and your <files> never leave it. There is no processing server. For offline use,
  install PDkef and let its required assets load while connected.` Compress keeps its tax-records
  example, Compress Image its passport-photo example, Unlock names the password. The two "Is it
  secure?" questions became "Is my PDF uploaded anywhere?" / "Is my PDF or its password uploaded
  anywhere?".
- **Descriptions** rewritten on merge, pdf-to-image, image-to-pdf, unlock, edit-pdf (149 chars, from
  179) and home (147, from 193): no "100%", "Secure", "instantly"; "on your device" as the claim.
- **Steps**: split step 4 and edit-pdf step 3 lost "instantly".
- **Home**: founder pill `Free / No caps, no watermark, no catch` (was "Free Forever"), privacy kicker
  `Private and open` (was "Transparent & Secure").
- `ToolHero.astro`'s comment no longer cites "In Your Browser" as its wrap example (the band technique
  and its rationale stay; QUAL-14's Hebrew accents can wrap too).

**Hebrew editions.** `h1`, `subhead`, `seoDescription` and `faq` are in `TOOL_SOURCE_FIELDS`, so the
published `/he/sign/`, `/he/merge/`, `/he/compress/` and `/he/` editions went stale against the new
English. Same handling as SEO-33: Hebrew wording unchanged, `sourceHash` refreshed mechanically (the
method was verified by reproducing the stored hashes from `origin/main`), a dated `reviewNotes` line on
each, and the four review-note blocks condensed under the schema's 600-character cap. **Shlomi's
re-read of the four Hebrew pages is pending.** Two Hebrew strings now diverge from the English rule
and are his call: `/he/merge/`'s h1 still says ישירות בדפדפן, and the Hebrew upload FAQ answers still
lead with "רץ כולו בדפדפן".

**Follow-ups split to [SEO-37](SEO-37.md):** the airplane-mode line on the other eight tool pages,
and a never-say guard in CI. No indexing request: the three never-crawled pages already spent theirs, the rest are
under a read (addenda dated 2026-09-19 on SEO-05, 07, 09, 28, 33, 35).

Checks: the full `ci.yml` chain through `test:weight` green on the worktree (3025 unit tests, 42 pages
through `test:seo`); Playwright product suite run before push.

## SEO review, 2026-09-19

A fresh Sonnet reviewer with the seo skill and no shared context audited the diff (report in the
session scratchpad, not kept). Outcome: no keyword lost from any title, h1 or description, no
duplicate h1, no new length overage (image-to-pdf's 63-character title and sign's 159-character
description predate this ticket and are untouched), every never-say phrase gone from both files, no
em dash, no competitor. Its one blocking objection was that unlock and the h1s were in the ticket's
"held" table; Shlomi had released both, so moot. One should-fix taken: the compress upload answer's
trailing "tax records, scanned IDs, and contracts included" now reads "your file, whether it is a tax
record, a scanned ID, or a contract, never leaves it", matching the compress-image construction. One
misread: it reported merge's subhead without the closer; the closer is there. One note accepted as a
deliberate choice: eight pages now share a byte-identical upload answer, which the skill's content
guidance flags as a thin-content marker; the per-page nouns and examples are the variation, and the
identical sentence is the point, one fact said one way.

## Outcome

Landed on `main` at `4927ca97` on 2026-09-19, Vercel auto-deploy. Ten tool pages and the hero say
the privacy claim one way each; no intensifier or never-say phrase remains in `tools.js` or
`homeContent.js`. Open elsewhere: Shlomi's re-read of the four Hebrew pages (LOC-03's domain), the
2026-10-08 reads that now carry this change as a variable, and SEO-37 for the proof line and the guard.
