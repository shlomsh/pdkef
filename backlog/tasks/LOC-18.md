---
id: "LOC-18"
title: "Hebrew edition sign-off: Israeli portal-limit guides and Shlomi's own /he/ read-through"
status: "in_progress"
priority: "P2"
horizon: "now"
epic: "search-and-languages"
depends_on: ["LOC-16"]
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

## 2026-10-22: the home page is signed off

Shlomi read the rendered `/he/` page through. From his read: the founder story gained the
sensitive-documents line and the handwritten Hebrew name (`8c2d7b73`, `a595ea25`, `9bc1367e`).
`he.yaml` now names him as reviewer, the launcher messages' draft comments are gone, and the languages
page's home cell is `reviewed`. While reading `/he/sign/` he found the Download and Share row under the
document still in English and laid out left to right; it now takes Sign's Hebrew labels and the page
direction (test first in `EditorExportActions.test.tsx`).

Left for item 2: the rest of the `/he/sign/` read-through, then the same sign-off on `hebrewSignMessages`.

## 2026-10-22: /he/sign/ signed off too, item 2 done

Shlomi: "sign also looks good enough from a brief reading". `hebrewSignMessages`' draft comments now say
so, and the languages page's Sign island cell is `reviewed`. Item 2 is done; item 1 (the two portal-limit
guides) waits on the signed-in limits listed above.

## 2026-10-22: Split, Image to PDF and PDF to Image signed off

Shlomi read `/he/split/`, `/he/image-to-pdf/` and `/he/pdf-to-image/` live ("done 1+2"), no changes.
All three now name him as reviewer, and their tool and island cells on the languages page are `reviewed`.
His one note, uneven line lengths in the "How it works" card, is a shared-component question that is
still open with him, not a translation fix.

Same day, Trends (Israel, 12 months, against `איחוד קבצי pdf` ~55): `כיווץ pdf` ~10 and `הקטנת קובץ
pdf` ~3, already served by `/he/compress/`; every Hebrew redact phrasing (`השחרת`, `טשטוש`, `מחיקת
טקסט`, `טיפקס`) is zero all year, so no Hebrew Redact edition.

## 2026-10-22: item 1 unblocked, both guides in progress

Shlomi pointed out the researched public limits are already enough to write both guides; the
signed-in portals were never a precondition. Confirmed in a real browser on gov.il the same day, so
both rows above now count as verified: Bituach Leumi's multi-year report, "גודל מקסימאלי לקובץ בודד
KB500", 10MB total, black and white up to 300 DPI; the courts' general request, one PDF of the request
and its attachments, up to 30MB, PDF only.

Both guides are being drafted as Hebrew editions (same pageId, so `/he/compress/`'s guide cards turn
Hebrew) with Israeli content and new measurements at the Israeli targets (500KB for scans, 150KB and
800KB for photos), not translations of the Indian-portal examples.

Drafted the same day (status `draft`, AI-written, waiting on Shlomi's read before publishing):

- `localized-pages/he/pdf-wont-compress-to-100kb.yaml`: measured at 500KB with Exact size on the COMP-01
  scan set (5 pages 493,560 bytes crisp; 10 pages 502,851 clear and slightly soft; 20 pages 488,187
  readable but visibly soft; the tool counts KB as 1,024, so typing 476 lands under 500,000 bytes:
  474,636 and 472,862). Also covers the courts' one-merged-PDF flow (Merge, then Compress only if
  over 30MB).
- `localized-pages/he/photo-and-signature-size-for-forms.yaml`: six measured rows carried over from
  2026-09-12, plus two new at the Israeli targets on a 1210x680 PNG copy of the guide's CC0 photo
  (150KB gives 148,483 bytes; 800KB gives 286,865, as quality is capped at 0.92).

Found on the way: `CompareFigure`'s tags used logical insets while its split is physical, so on the
first RTL page to use it the tags named the wrong images. Fixed with physical sides and a test.
