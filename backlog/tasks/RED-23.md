---
id: "RED-23"
title: "Sign's Whiteout removes what it covers, through the same removal as Redact"
status: "retired"
priority: "P2"
epic: "redact-tool"
depends_on: ["RED-22"]
---

# RED-23 · Sign's Whiteout removes what it covers, through the same removal as Redact

**Retired 2026-09-28.** Shlomi chose single-image flattening over removal in place: simple and safe by construction beats a content-stream editor for the narrow value of editing a covered page later. The spike that proved it possible is in `spikes/red-18/` and RED-18.

*Decided with Shlomi 2026-09-28, reversing RED-10's "it only covers".*

Whiteout means one thing across PDkef: what you cover is gone, and nothing around it changes. Sign's
export runs its Whiteout boxes through RED-19 to RED-22's removal and checks.

- Update Sign's hint (`whiteoutAction` in `src/i18n/toolMessages.ts`, English and Hebrew; Shlomi approved
  the current Hebrew line's register) to say it removes what is under it.
- Add the /sign/ Whiteout FAQ in English and Hebrew in the same change (the /he/sign/ freshness hash
  fails otherwise). The draft kept in RED-10 needs its "saved as a picture" wording replaced.

## Acceptance

- Sign, a large black title on white, the last word whited out: the saved file's text is the title
  without that word, in its original font, and the neighbouring word is intact.
