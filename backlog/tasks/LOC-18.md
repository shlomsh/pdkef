---
id: "LOC-18"
title: "Hebrew edition sign-off: Israeli portal-limit guides and Shlomi's own /he/ read-through"
status: "blocked"
priority: "P2"
epic: "search-and-languages"
depends_on: ["LOC-16"]
waiting_on: "Shlomi's read-through"
needs: "Israeli portal size limits and a read-through of /he/"
---

# LOC-18 · Hebrew edition sign-off: Israeli portal-limit guides and Shlomi's own /he/ read-through

*Filed 2026-09-13* to close [LOC-16](LOC-16.md): items 1, 2 and 5 there are shipped (HeroDemo, the
rest of the Sign editor, the `/he/` markdown twin). What is left is exactly two items, and neither is
engineering work waiting on an agent - both are waiting on something only Shlomi can supply. Splitting
them out so LOC-16 can close instead of sitting open with nothing buildable left on it.

## 1. Two Hebrew compress-hub guides, blocked on real Israeli portal limits

`pdf-wont-compress-to-100kb` and `photo-and-signature-size-for-forms` have no Hebrew edition, so
`/he/compress/` is the only Hebrew tool page whose guide cards are all still English. Both English
guides teach portal-specific size limits; a translation that swaps language but keeps the American
portal names is exactly the doorway pattern `content-and-copy.md` rejects ("teach something
verifiable, disclose the awkward fact" - the same standing rule LOC-15's Indonesian pilot cited its
own portal numbers against). This is not translation work, it is original research: which Israeli
government/education/employment portals impose an upload size cap, and what the cap actually is, each
cited to the portal's own page with a capture date - the same bar LOC-15's SSCASN/SNPMB research set.

**Needed from Shlomi, not from this ticket:** the portal names and their real size limits. Once that
lands, drafting both guides through the normal draft/preview/review gate the other eight Hebrew guides
used is ordinary engineering work and does not need to wait on anything else.

## 2. Home page sign-off, blocked on Shlomi's own read-through

`src/content/localized-home/he.yaml` still carries `reviewer: 'Claude Sonnet 5'` and a `reviewNotes`
that says plainly this is an AI draft pending Shlomi's own read-through, not a native review. Shlomi
has since edited four of its strings live on `main` (the H1's "only" emphasis, the MIT trust chip, the
GitHub star ask, the Compress placeholder), but that pass did not touch the
`reviewer`/`reviewedAt`/`reviewNotes` fields themselves, so the file still does not say a native review
happened. The languages page (`docs/i18n-status/`) currently records the home cell as `published`, one
stage short of `reviewed`. The same sign-off applies to the Hebrew `FileDropzoneMessages`/
`RecentFilesMessages` objects in `src/i18n/toolMessages.ts` and to the Hebrew `SignMessages` object
LOC-16 item 2 completed, all three still carrying their own "AI draft, not yet reviewed" comments.

**Done means:** Shlomi's actual read-through of the rendered `/he/` page (and `/he/sign/`, now that its
editor is fully translated), with `reviewer`, `reviewedAt`, and `reviewNotes` updated to say so for
real, and the languages page's home cell moved from `published` to `reviewed` (edit the artifact, then
sync `docs/i18n-status/data/i18n-status.json` per `content-and-copy.md`'s procedure).

## Status

Both halves are waiting on Shlomi, not on an agent - `status: blocked` rather than `open` for that
reason. No further engineering scoping needed here; when either input arrives, do the corresponding
"Done means" step above.

## 2026-10-22: public portal limits, researched

Three research passes; every row below was re-checked by fetching the portal's own page and finding the
quoted words on it (2026-10-22).

| Portal | Upload | Limit |
| --- | --- | --- |
| Bituach Leumi, "שליחת מסמכים" ([FAQ](https://www.btl.gov.il/About/faq/TroubleShooting/FaqGeneral/Pages/איך-ניתן-לשלוח-לכם-מסמכים.aspx)) | claim documents | 10 MB per file, up to 15 files; JPG, PNG, TIFF, BMP, PDF |
| Bituach Leumi, "שירות אישי" ([FAQ](https://www.btl.gov.il/About/faq/TroubleShooting/FaqIshi/Pages/כיצד--ניתן-לשלוח-מסמכים-בשירות-אישי.aspx)) | personal-area documents | 5 MB per file; JPG, PNG, TIF, PDF |
| Bituach Leumi, פניות הציבור ([page](https://www.btl.gov.il/about/contact_us/pages/pniot_hatsibur.aspx)) | inquiry attachments | 10 MB per file; PDF, PNG, JPG, TIFF |
| NITE, special accommodations ([page](https://www.nite.org.il/special-test-accommodations-guidance/upload-documents/)) | supporting documents | 8 MB per file, PDF only |
| Open University, student card ([page](https://www.openu.ac.il/registration/guidelines/pages/studentid.aspx)) | ID photo | JPG, up to 150KB |
| Maccabi, administrative form ([page](https://www.maccabi4u.co.il/forms/administrative_issues/)) | attachments | 800KB; txt, pdf, jpg, gif (this one form only) |
| Ministry of Defense, Hachvana deposit ([page](https://www.hachvana.mod.gov.il/GrantAndDeposit/DepositUpTo5/Pages/education.aspx)) | scanned voucher | 10 MB per file, up to 10 files; PDF, PNG, TIFF, JPG |

Reported by the research but not re-fetched here (gov.il answers scripts with 403): Bituach Leumi's
multi-year self-employed report on gov.il, 500KB per file and 10MB total, black and white up to 300 DPI
(`gov.il/he/service/annual_report`); courts general request, 30MB total, PDF only (from an archive.org copy
of `gov.il/he/service/general_labor_court_application`). gov.il's own attachment guide says each ministry
sets its own limit. Confirm both in a browser before quoting them.

No public number found, so these need someone signed in: the Tax Authority personal area, the Civil
Service Commission's "נספחים" upload, university applicant portals (HUJI, TAU, Technion, BGU), the IDF
recruits site, PIBA's online photo upload, and the upload screens of Clalit, Maccabi (app), Meuhedet and
Leumit.

The 500KB gov.il report and the 150KB Open University photo are the guide's natural examples: real
limits a phone scan misses.
