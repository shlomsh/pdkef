---
id: "ARCH-41"
title: "Compress, Image to PDF and Unlock/Protect finish with the shared Download control"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
order: 2
depends_on: ["ARCH-36"]
---

# ARCH-41 · Compress, Image to PDF and Unlock/Protect finish with the shared Download control

*Filed 2026-10-26* when ARCH-36 landed logic only. Shlomi chose to keep the three tools' current
look for now and to treat the visual unification as its own design change.

## Why

ARCH-36 moved Compress, Image to PDF and Unlock/Protect onto `usePreparedOutput` and
`useDownloadFlow`, so the preparer, share ladder, hand-offs and telemetry are shared. Their visible
control is still the legacy `DownloadButton`, while Merge, Split, Edit Pages, PDF to Image and Scan
finish with `DownloadElement` / `FinishRow` / `PhoneFinish`. Adopting the shared control changes what
people see: a larger box with ready, preparing and saved states, new "Saved" / "download again"
strings in English and Hebrew, and for Compress a layout with no phone bar today.

## Outcome

- A design pass first, shown to Shlomi on a phone and a desktop before any build: where the shared
  control sits in each of the three layouts, and which hand-off chips each tool offers (Compress
  cannot hand off to itself).
- Then the three tools render the shared finish components, `DownloadButton` is deleted, and the
  new strings exist in both languages.

## Acceptance

- [ ] The design is approved before implementation starts.
- [ ] No import of `DownloadButton` remains.
- [ ] Each tool's unit and e2e specs are updated for the new control and pass; verified on a
      production build at a phone and a desktop width.
