---
id: "RED-10"
title: "Sign's Whiteout: decide whether it removes what it covers, or says plainly that it only covers"
status: "open"
priority: "P3"
epic: "redact-tool"
phase: "later"
depends_on: []
---

# RED-10 · Sign's Whiteout: decide whether it removes what it covers, or says plainly that it only covers

*Filed 2026-09-27 from RED-01's record; reframed the same day when the removal engine was retired (RED-12).*

Sign's Whiteout paints over content that stays in the file. That is fine for tidying a form before
writing on it, and wrong if someone uses it to hide something. Decide which job it has before building
anything: most likely a plain line where Whiteout is picked that points to Redact for hiding, and no
removal at all.

## Acceptance

- The decision is recorded here, and whatever it needs (a line of copy, or a real change) is built.

## Decision (2026-09-28)

**Whiteout only covers, and says so.** Its job is tidying a form before you write on it: painting over an
old answer or a stray mark. Giving it a removal engine would bring back everything RED-12 retired, for a
use nobody asked Sign to serve, and Redact already hides things for good (a covered page is saved as a
picture, and since RED-12 its other words stay searchable). So no removal, and two plain lines:

- **Where Whiteout is picked**, the armed status line on desktop now reads "Click and drag to cover an
  area. What's underneath stays in the file; to hide it for good, use Blur & Redact PDF." (Hebrew: "לחצו
  וגררו כדי לכסות אזור. מה שמתחתיו נשאר בקובץ; כדי להסתיר אותו לצמיתות, השתמשו בטשטוש והשחרה.", to go
  through Shlomi's /he/ read-through with LOC-18). The touch line stays "Tap and drag to white out an
  area.": it is already at the two lines the phone row allows beside the switch and arrows, and Sign's
  mobile UI is frozen for the SNG redesign, whose Whiteout should carry the same sentence.
- **On /sign/**, a FAQ answer: "Does Whiteout remove what it covers?" No, it only covers; use Blur &
  Redact PDF to hide something for good.
