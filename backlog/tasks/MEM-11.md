---
id: "MEM-11"
title: "Surface the 28-day / 6-file retention limit in the UI, not just the FAQ"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
order: 4
depends_on: []
---

# MEM-11 · Surface the 28-day / 6-file retention limit in the UI, not just the FAQ

*Filed 2026-09-28*, out of an external review of the draft-persistence feature. The review flagged
that `README.md` claimed a draft "is cleared only when you choose Start over" (fixed in this same
change), when [`draftStore.js`](../../src/lib/drafts/draftStore.js) actually expires every draft
after 28 days of inactivity (`draftPolicy.js`'s `MAX_AGE_MS`) and keeps only the 6 most recently
touched files (`MAX_RECENT_FILES`), evicting older ones purely by recency, with no exemption for an
entry that still carries real unsaved work (`draftStore.js` lines 22-24 say this is deliberate).

## What's already true

The per-tool FAQ copy (`src/data/tools.js`, Sign/Redact/Merge entries) already states the 28-day
limit correctly. Nobody, anywhere in the UI, states the 6-entry cap, and neither limit is visible at
the moment it matters: next to the "Draft saved" status chip, or on the home page's recent-files
list when a file is close to falling out of the six.

## What to build

Scoped and designed as its own piece of work, not folded into a docs fix:

- Retention info next to the "Draft saved" chip (`ToolShell.tsx`'s status chip, and Merge's own
  status row in `PdfMergeTool.tsx`) — short, in voice, no security-lecture tone.
- Visible warning when a file is about to be evicted: either about to age out past 28 days, or about
  to fall out of the 6-entry recency window because other files were opened more recently.
- Home page recent-files list is the natural place for the eviction warning since that's where the
  6-entry cap actually bites; needs its own design pass rather than reusing tool-shell chip copy.

## Acceptance

- A person looking at "Draft saved" can find, without hunting, that this is a 6-file, 28-day
  convenience cache and not permanent storage.
- A draft close to eviction (by age or by recency rank) shows a visible warning before it's gone,
  not just a FAQ sentence.
- Copy reviewed against the voice guide in `.claude/rules/content-and-copy.md` (plain facts, no
  em dashes, no security jargon).
