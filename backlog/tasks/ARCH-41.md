---
id: "ARCH-41"
title: "Compress, Image to PDF and Unlock/Protect finish with the shared Download control"
status: "in_progress"
priority: "P3"
epic: "unify-and-narrow"
horizon: "now"
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

## Design (approved by Shlomi 2026-10-28)

- **Phone: Merge's arrangement, no sticky footer.** Shlomi rejected the sticky bottom sheet ("it takes
  predefined real estate at all times"). Below 1024px each tool shows the shared `chip-bar` with
  `PhoneFinish` (quiet Download, then the done strip with the hand-offs), and `DownloadElement` +
  `FinishRow` sit in the page flow at the end of the layout. Compress's first-screen spec now checks
  the bar's Download.
- **Desktop: the loaded card is exactly one screen tall.** The result stage takes `data-fills-stage`
  and sizes itself with `useFloorHeight`, the way Scan does, so the card neither stops short of the
  window's foot nor runs past it. The Download box and the Share + hand-off row sit in the rail.
- **Hand-offs:** Compress (PDF) offers Sign and Merge, Compress Image offers Share only; Image to
  PDF offers Compress and Sign and keeps "Clean it up as a scan" as a quiet link; Unlock offers
  Redact and Sign, Protect Share only. Unlock's "Continue in {tool}" return path stays as it is.
- **Labels:** the button says "Download" and "Share" only (settled for Compress in 27a5dc36), with
  the shared "Saved" / "download again" states.
- Mockups: the phone options comparison and the design pass, drawn in this session.

## Acceptance

- [x] The design is approved before implementation starts.
- [ ] No import of `DownloadButton` remains.
- [ ] Each tool's unit and e2e specs are updated for the new control and pass; verified on a
      production build at a phone and a desktop width.
