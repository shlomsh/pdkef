---
id: "DRIVE-03"
title: "iPhone check of the real Google Drive build"
status: "open"
priority: "P2"
epic: "polish"
horizon: "now"
order: 3
depends_on: ["DRIVE-01", "DRIVE-02"]
needs: "A run on your iPhone, Chrome and Safari"
---

# DRIVE-03 · iPhone check

Nothing after this ships until it passes. On a real build: Chrome and Safari, a PDF and a photo,
double-tap on a file, and whether the whole-page 500 seen once on 2026-11-05 comes back (its source was
never found; Vercel's logs showed none).
