---
id: "MOBI-09"
title: "Give iOS its own entry path, stated in the product"
status: "open"
priority: "P2"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# MOBI-09 · Give iOS its own entry path, stated in the product

## Scope and acceptance

**iOS does not implement Web Share Target and is not going to, so a large part of the audience will
never get the share-sheet shortcut the rest of this epic is built around.** DEMO-03 recorded this
honestly and then left it there. The consequence is that on iPhone, the entire "get the form in" step
is undocumented: the tool shows a dropzone and a file picker, and the visitor is left to work out on
their own that the route is to save the PDF to Files first.

That route is genuinely short once known. Share the PDF out of WhatsApp or Mail, Save to Files, then
in PDkef tap Choose file: the iOS document picker opens on Recents and the file just saved is the top
item. Four taps, no install, works today. It only feels bad because nothing says it.

Add platform-detected guidance at the point of need, on the tool's own empty state rather than as
another card on the home page. One or two lines, in the product's ordinary voice, describing what to
do rather than apologising for a browser limitation or explaining Web Share Target to someone who does
not care.

Do not overclaim in either direction. The copy must not imply iOS gets the Android share-sheet path,
and must not imply iOS is second-class or broken, because for this flow it is neither: it is four taps
against three. Keep the existing "Add to Home Screen" guidance separate and about offline use, which
is what it is actually for.

**One option to decide rather than drift past.** An iOS Shortcut, published as an iCloud link, can
appear in the share sheet, save the PDF to Files and open `/sign/` in one action, collapsing the app
switch. It cannot hand bytes to the page, so the user still picks from Recents, and it is a
distribution artifact living outside the repo that someone has to keep working across iOS releases.
Decide it explicitly, with reasoning, and record the decision here either way.

**Acceptance.** On iOS Safari the Sign tool's empty state shows the Files route in at most two
sentences, and shows nothing of the sort on Android or desktop. The full path is walked on a real
iPhone and the real tap count recorded here, confirming the picker does open on Recents with the saved
file first. No copy anywhere on the site claims a share-target capability iOS does not have. The
Shortcut question is answered in this ticket rather than left open.

## Implementation 2026-09-11

**Status: code-complete, real-device walk still pending (see below).**

**What shipped.** A platform-detected notice on the Sign tool's empty state only (`DropzoneEmptyState.tsx`,
mounted through `BasePdfTool.tsx`), gated on a new opt-in prop (`showIosFilesHint`) that only
`PdfSignTool.tsx` sets - every other tool (Merge, Split, Compress, Edit Pages, PDF to Image, Unlock,
Image to PDF, Redact) is unaffected, since the prop defaults to `false` and the shared shell component
is otherwise untouched.

- `src/lib/platform.ts` (new): `isIOSDevice(nav)`, a pure function taking a plain
  `{ platform?, userAgent?, maxTouchPoints? }` object rather than the global `navigator`, so it is
  unit-testable without touching jsdom's own UA string. Matches classic iPhone/iPad/iPod user agents
  and platform strings, plus iPadOS 13+, which reports `platform: "MacIntel"` (a real desktop-site Mac
  UA) but is distinguishable from an actual Mac by `maxTouchPoints > 1` (a real Mac reports 0, or at
  most 1 for a trackpad's single synthetic point). Detection is platform-based, not browser-based, on
  purpose: every browser on iOS (Chrome, Firefox, Edge...) is a WebKit wrapper under App Store rules, so
  the Web Share Target gap is identical regardless of which one opened the page - "iOS Safari" in this
  ticket's acceptance line means "on iOS", not "specifically Safari".
- `src/i18n/toolMessages.ts`: added `iosFilesHint` to `ShellMessages` (English and Hebrew, both listed
  below), following the same shell-catalogue pattern every other string in that interface uses.
- `src/components/DropzoneEmptyState.tsx`: added `showIosFilesHint` prop and an `isIOS` state that
  starts `false` and is set only from a mount effect (`useEffect`), never the render body or a
  `useState` initializer - the same hydration-match rule `FileDropzone.tsx`'s `recents` state already
  follows and that CLAUDE.md's "UI & State Invariants" section documents: the server has no `navigator`,
  so the first client render must render nothing here too, or Preact repairs the mismatch by keeping
  the server's node and *appending* its own rather than replacing it (the exact bug `203b204` fixed for
  `recents`). The notice renders as a new paragraph after the existing privacy line.
- `src/components/Dropzone.module.css`: added `.ios-files-hint` (plain body text, not another pill like
  `.privacy-line` - supplementary guidance, not a trust signal).
- `src/components/BasePdfTool.tsx`: forwards a new `showIosFilesHint` prop (default `false`) to
  `DropzoneEmptyState`.
- `src/components/PdfSignTool.tsx`: passes `showIosFilesHint` (always `true`) to `BasePdfTool` - this is
  the one and only call site that opts in, which is what scopes the notice to Sign per this ticket's
  acceptance line rather than shell-wide. It reaches `/he/sign/` automatically, since that page renders
  the same `PdfSignTool` component with a Hebrew `shellMessages` table.

**Copy added** (both read as two sentences, never mention Web Share Target, never claim iOS gets the
Android share-sheet path, never call iOS second-class):

- English: "On iPhone or iPad, share the PDF to Files from Mail, WhatsApp, or any other app, then tap
  Choose file. It opens on Recents, with the file you just saved at the top."
- Hebrew: "באייפון או אייפד, שתפו את קובץ ה-PDF ל-Files מתוך Mail, WhatsApp או כל אפליקציה אחרת, ואז
  לחצו על בחירת קובץ. הוא ייפתח בכרטיסיית \"אחרונים\" ב-Files, עם הקובץ ששמרתם הרגע למעלה." App/action
  names (Files, Mail, WhatsApp, PDF) are kept in Latin script, matching the existing convention in
  `src/content/localized-pages/he/how-to-sign-a-pdf-on-iphone.yaml` (e.g. "פתחו את הקובץ ב-Mail או
  ב-WhatsApp, בחרו שיתוף ואז \"Save to Files\"").

**The Shortcut question: decline, not shipped.** Reasoning, matching the tradeoff the ticket itself
lays out: an iOS Shortcut cannot hand the PDF's bytes to the page directly (`window.location.href`
navigation and Shortcuts' own "Open URL" action carry no file payload), so the user still ends up
picking the file from Recents in the OS document picker - the Shortcut would only save one app-switch
out of the four-tap path already described above, collapsing it to roughly three taps instead of
removing the manual step entirely. Against that small saving: it is a distribution artifact that lives
outside this repository (published via iCloud link, discovered by a separate URL/QR code, not through
`/sign/` itself), it needs re-verification and possibly re-publishing across iOS releases as Shortcuts'
own action set and permissions model changes, and unlike everything else in this codebase it cannot be
tested by this project's own CI. Four taps against Android's three is already competitive, and the
notice this ticket adds is what makes that route discoverable at all, which was the actual gap - not
the tap count. Revisit only if real usage data (Search Console queries mentioning "shortcut", or direct
user requests) shows the four-tap path is where people are dropping off, not just that it's slightly
longer than Android's.

**What the tests prove.** `src/lib/platform.test.ts` (9 cases): empty/missing navigator, classic
iPhone/iPad/iPod UAs, iPadOS-as-Mac with `maxTouchPoints > 1`, a real Mac with `maxTouchPoints` 0 and 1,
Android, Windows. `src/components/DropzoneEmptyState.test.tsx` (5 cases, mirroring
`FileDropzone.test.tsx`'s own hydration-guard pattern): (a) the first render shows no notice on a
stubbed iOS navigator (proving the hydration-match rule), (b) the notice appears after the mount effect
flushes on a stubbed iOS navigator, (c) it never appears on a stubbed Android navigator, (d) it never
appears on a stubbed desktop navigator, (e) it never appears on iOS when the calling tool has not passed
`showIosFilesHint`. All existing `FileDropzone.test.tsx` and `PdfSignTool.test.tsx` cases still pass
unchanged. Full suite: 2249 passed (2235 before this change, +14: 9 in `platform.test.ts` + 5 in
`DropzoneEmptyState.test.tsx`). `npm run typecheck`, `npm run build`, `npm run test:csp`,
`npm run test:css`, `npm run test:seo`, and `npm run test:redirects` all pass; `npm run build && npm run
preview` (port 4181) confirmed `/sign/` still hydrates with no CSP violations and no new console errors
(the one pre-existing service-worker registration error in local preview is unrelated to this change and
present on `main` too).

**Pending for Shlomi - cannot be done from here.** The ticket's acceptance line asks for the full path
walked on a real iPhone with the tap count recorded: share a PDF from Mail or WhatsApp to Files, open
`/sign/` in Safari, confirm the new notice reads correctly at real viewport width, tap Choose file, and
confirm the document picker opens on Recents with the just-saved file first, then record the actual tap
count. This environment has no physical iPhone and cannot spoof `navigator.platform`/`maxTouchPoints` on
a live page after load without racing the mount effect (an emulated desktop-Chrome "mobile" viewport
here reports an Android UA, not an iOS one, so it can't stand in for the real check either) - the
component tests above exercise the exact same `isIOSDevice()` function and render path against stubbed
navigator objects instead, which is as close as this environment gets. Status stays `open` until that
walk is done.

**iPad landscape, measured 2026-09-12.** The desktop grid in `Dropzone.module.css` (`min-width: 1024px`,
fixed `height: 168px`, two explicit rows) gives this hint an implicit third row, and a CSS-only read
suggested it could spill past the box. Measured in a real browser instead, against a production build
served statically, with Playwright's iPad device descriptors (their `iPad` UA is enough for
`isIOSDevice()` to render the hint): iPad Mini (1024px), iPad gen 7 (1080px) and iPad Pro 11 (1194px)
landscape, WebKit and Chromium. In every case the dropzone is 168px, `scrollHeight` is 165 to 166
against a `clientHeight` of the same, and the hint's two lines end 37px above the box's bottom edge
(`/he/sign/`, whose hint wraps to three lines under `dir="rtl"`, ends 28px above). Nothing overflows;
`align-content: center` packs the three rows into about 93px and centres them. No change needed.
