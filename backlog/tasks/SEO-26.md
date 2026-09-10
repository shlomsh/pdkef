---
id: "SEO-26"
title: "Say what PDkef does not do, and why, on a page that already exists"
status: "open"
priority: "P3"
epic: "search-acquisition"
phase: "later"
depends_on: []
legacy_state: "Open"
---

# SEO-26 · Say what PDkef does not do, and why, on a page that already exists

## Scope and acceptance

**Deferred deliberately.** It is worth doing and it is worth nobody's first week.

Five high-volume things this product cannot do, each for the same architectural reason, recorded in
[docs/seo-competitive-findings.md](../../docs/seo-competitive-findings.md): PDF to Word, OCR of scanned
documents, legally binding signatures with an audit trail, AI summarisation and chat, and cloud batch
processing of very large files. People arrive looking for all five.

**No new page.** This must not become a landing page targeting `pdf to word`, because we cannot serve
that visitor and ranking for it would earn a bounce and teach Google we are a bad answer. A short section
on an existing page, most likely `/` or `/open-source-pdf-editor/`, where it reaches someone already
reading about how the thing works.

**Why it is worth saying at all.** The reason we cannot do these is the same reason the files are not
uploaded, and explaining that is the strongest version of the privacy story. "There is no server, which
is why nothing is uploaded, and also why we cannot run OCR for you" is a more convincing sentence than
either half alone. It also sets expectations before someone wastes their time, which is the register the
voice rules ask for - a person being straight with you rather than a product selling to you.

**Where to be careful.** Each explanation should be a plain technical fact, not a swipe at tools that do
offer these. They offer them because they have servers. That is a legitimate trade with a real cost, and
saying so fairly is more persuasive than implying they are careless.

**Acceptance.**

- One section on an existing page. No new URL, no new sitemap entry.
- Each of the five is named with its one-sentence reason, and each reason is technically accurate.
- Nothing in it disparages tools that do offer these features.
- Any FAQ addition is mirrored into `<SeoSchema>`; `npm run test:seo` passes.
