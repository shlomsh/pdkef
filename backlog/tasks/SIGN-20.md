---
id: "SIGN-20"
title: "The per-script pixel guards are close to blind to a cluster whose ink is right and whose advance is wrong"
status: "open"
priority: "P3"
epic: "sign-tool-architecture"
phase: "optional"
depends_on: []
legacy_state: "Open — raised 2026-08-29 from SIGN-19"
---

# SIGN-20 · The per-script pixel guards are close to blind to a cluster whose ink is right and whose advance is wrong

## Scope and acceptance

**The per-script pixel guards are close to blind to a cluster whose ink is right and whose advance is wrong.** A pixel diff of one string rendered in isolation compares ink, and an advance error lives in the trailing space *after* the ink, where there is nothing to differ. So a cluster can report a near-perfect pixel match while telling the exporter it is far narrower than it draws - and in a real multi-cluster run that pulls everything after it out of place. **Measured, not hypothetical, and platform-independent** (Noto Sans Bengali, at the 100px geometry these were found on): `হ্ন` fontkit 53.40px vs Chromium 74.40px (**21px, 28% short**) at a 6.16% pixel diff; `ক্ত` 71.00 vs 91.00px (**20px**) at 7.27%; `দ্ধ` 53.10 vs 64.60px (11.5px) at 9.97%. The first two are **still in the enforced Bengali corpus and passing**, because their ink genuinely matches; only `দ্ধ` crossed a tolerance once the rasteriser noise was removed, and it was excluded on its merits. `স্ক`'s 14% under-report is the same class, caught only because its ink is broken too. **The fix is an advance-parity assertion beside the pixel one**, which the repo already has the shape of: `hebrew-font-parity.spec.js` ("Guard A") and the CJK guards both compare fontkit's shaped advance against `measureText`. The one new thing needed is separating a real divergence from the browser's own whole-pixel advance rounding, and SIGN-19 established the bound that does it: rounding can move a cluster's advance by at most `glyphCount x 0.5px`, so anything beyond that cannot be rounding. Checked against the data, that bound cleanly separates every known case (`হ্ন` 21px against a 1.5px bound) from every rounding artefact (`phrase:jumhuriya` 2.008px against an 8.5px bound). **Expect it to go red on landing** - at minimum `হ্ন` and `ক্ত`, and it should be run across every bundled font rather than Bengali alone, since the one Latin probe done so far already found Caveat disagreeing by 5.1px on "Sarah Levi" (kerning fontkit applies and Chromium does not, or vice versa), which nothing currently checks. That is the point of the ticket: the finding is that we do not know how wide this class is. Do not close it by widening a tolerance, and do not read the Bengali corpus's green as a statement about cluster advances until it lands.
