# Shaping guard platform calibration (SIGN-19)

**Status:** open, unassigned. Opened 2026-08-29 from CI run
[33242665616](https://github.com/shlomsh/pdkef/actions/runs/33242665616) on `b4ffd96`.

**One sentence:** the Chromium output guards give different verdicts on macOS and on the Linux CI
runner, and until that is resolved a green local run is not evidence about the exported PDF and CI
cannot go green.

This document is the pickup brief. It carries the measurements, the ruled-out explanations, the
decision that has to be made, and the agent prompt. Read it before touching any guard.

---

## 1. What happens

`npm run test:e2e` on the same commit, same specs:

| | macOS 15 (Darwin 25.5.0), local | `ubuntu-latest` CI runner |
| --- | --- | --- |
| Result | 79 passed, 1 skipped, **1 failed** | 75 passed, 1 skipped, **5 failed** |

The one shared failure is SIGN-18 (toolbar wrapping), which is unrelated and understood. The other
four exist only on Linux:

| Guard | Failing cases |
| --- | --- |
| Arabic shaping (Scheherazade New) | 18 of 151 |
| Pashto shaping (Scheherazade New) | 9 of 22 |
| Bengali shaping (Noto Sans Bengali) | 2 of 259 |
| Exported PDF render guard | 2 of 23 drifted |

## 2. The measurements

Every shaping guard is self-calibrating: it partitions the corpus into cases where fontkit applied a
substitution and cases where it did not, measures a **noise floor** from the latter, and sets
**tolerance = floor x 1.5**. So the floor is not a constant, it is measured per run, per platform.

Tolerances measured on both platforms at `b4ffd96`:

| Guard | macOS | Linux CI | Direction | Linux result |
| --- | --- | --- | --- | --- |
| Arabic | 22.33% | **4.14%** | Linux 5.4x stricter | 18/151 fail |
| Pashto | 22.33% | **4.14%** | Linux 5.4x stricter | 9/22 fail |
| Bengali | 14.48% | **8.27%** | Linux 1.8x stricter | 2/259 fail |
| Tamil | 12.74% | **8.65%** | Linux 1.5x stricter | passes |
| Telugu | 15.70% | **9.80%** | Linux 1.6x stricter | passes |
| Latin / Pacifico | 14.46% | 45.30% | Linux 3.1x looser | passes |
| Latin / DancingScript | 29.61% | 49.87% | Linux 1.7x looser | passes |
| Latin / GreatVibes | 32.88% | 103.54% | Linux 3.1x looser | passes |

The export render guard reports an identical determinism floor of 0.00% and tolerance 12.50% on both
platforms, and 0 drifted locally against 2 on CI. Its calibration is therefore **not** the variable;
its committed baseline images are.

## 3. What this rules out

- **"CI is just noisier."** No. Linux is stricter on all five script guards and looser on all three
  Latin handwriting guards. The direction depends on the font, not the machine.
- **"macOS is the reference because it is where the work was done."** This is the tempting one and it
  is the weakest position available. A 22.33% tolerance on Arabic admits roughly a quarter of the
  pixels differing before it complains. That guard was close to toothless locally, which is why it
  reported green; the Linux run at 4.14% is the more informative measurement, not the anomalous one.
- **"Widen the tolerance."** Explicitly forbidden by the standing rule in SIGN-10 and SIGN-16, and it
  would make the strictest, most informative configuration match the weakest one.
- **"It is a fontkit bug."** Not established, and mostly contradicted: see the next section.

## 4. Sub-pixel placement versus one real divergence

Do not treat the 29 failing cases as one bug. The Arabic and Pashto failures pair large pixel diffs
with tiny width deltas, which is the antialiasing/rounding signature rather than a wrong glyph:

```
initial:ت  "تـ"           diff= 6.16%  widthDiff=0.46px  native 27.00 vs recon 27.46
name:ahmad  "أحمد"        diff= 4.43%  widthDiff=0.02px  native 159.00 vs recon 158.98
phrase:jumhuriya          diff=24.74%  widthDiff=2.01px  native 481.00 vs recon 483.01
persian-word:afghanistan  diff=17.59%  widthDiff=0.83px  native 262.00 vs recon 261.17
```

All 27 Arabic and Pashto failures sit under a 2.01px width delta. One case does not fit that pattern
at all:

```
conjunct:ska  "স্ক"        diff=12.36%  widthDiff=11.00px  native 75.00 vs recon 64.00
```

An 11px disagreement on a 75px advance is a shaping divergence, not placement noise. It belongs in
the same conversation as the three named entries in `KNOWN_FONTKIT_DIVERGENCES` in
`e2e/sign/fixtures/bengaliCorpus.js` (ট্র, ঠ্র, ক্ক), and the precedent for how to judge it is in
CLAUDE.md: Playpen Sans Hebrew was dropped from the catalogue outright for an 88% systemic
disagreement, while Bengali's three narrow, enumerable clusters were kept and named to the user. A
fourth entry is a legitimate outcome. Silently widening Bengali's tolerance to swallow it is not.

## 5. The decision to make

Pick one and write down why:

1. **Pin the runner.** Treat Linux CI as the single calibration and baseline platform. Guards run
   there and are advisory locally. Baseline regeneration only ever happens on that platform, via an
   explicit script rather than whatever machine is handy.
2. **Calibrate per platform.** Let each guard keep measuring its own floor wherever it runs, and
   commit per-platform baselines for the export render guard. Honest, but it doubles the baseline
   artefacts and means a case can pass on one machine and fail on the other forever.
3. **Run only where calibrated.** Skip the pixel guards outside CI entirely, so nobody reads a local
   green as evidence.

Whatever is chosen, prefer the platform that produces the **tighter** floor per guard rather than the
one that is convenient. The point of these guards is to catch a wrong glyph in a downloaded PDF; a
tolerance wide enough to never fire is worse than no guard, because it reports success.

## 6. Acceptance

- A written decision in this file on which platform calibrates, and why.
- `npm run test:e2e` green on the CI runner, with no tolerance widened and no assertion deleted.
- `স্ক` either explained as placement noise with a measurement, or added to
  `KNOWN_FONTKIT_DIVERGENCES` with its numbers and surfaced in the Sign page's Bengali FAQ the way
  the existing three are.
- CLAUDE.md's "having all five stages is not agreement" paragraph updated to say which platform the
  per-font shaping guards actually prove agreement on, since today it does not say.

## 7. Agent prompt

> You are picking up SIGN-19 in the pdkef repo. Read `CLAUDE.md` (especially the font/shaping
> sections in Part I and the guardrails in Part II §6) and `docs/shaping-guard-platform-calibration.md`
> in full before changing anything.
>
> Problem: the Chromium shaping and export-render guards disagree between macOS and the Linux CI
> runner on the same commit. On `b4ffd96`, macOS gives 79 passed / 1 failed and Linux gives
> 75 passed / 5 failed. Four failures are Linux-only: Arabic 18/151, Pashto 9/22, Bengali 2/259, and
> the exported-PDF render guard 2/23. The measured tolerances are in the table in that doc; note that
> Linux is *stricter* on every script guard and *looser* on every Latin handwriting guard, so "CI is
> noisier" is not the explanation and macOS is not automatically the reference.
>
> Your job, in order:
> 1. Reproduce on Linux. Use the CI runner or a Linux container with the same Chromium Playwright
>    installs. Do not try to fix this from macOS observations alone.
> 2. Decide the calibration policy from the three options in §5 of the doc, write the decision and
>    its reasoning into that file, and implement it.
> 3. Separate the two failure classes. 27 of the 29 failing shaping cases have width deltas under
>    2.01px and read as sub-pixel placement. `conjunct:ska` "স্ক" has an 11.00px delta on a 75px
>    advance and is a candidate fourth entry for `KNOWN_FONTKIT_DIVERGENCES` in
>    `e2e/sign/fixtures/bengaliCorpus.js`. Judge it on its own evidence.
> 4. Update CLAUDE.md to state which platform the per-font shaping guards prove agreement on.
>
> Hard constraints, all from the repo's standing rules: do not widen any tolerance to make a test
> pass, do not delete assertions, do not regenerate baselines on whatever machine is convenient, and
> do not weaken the two-way assertion in `fontCoverage.test.js`. Platform baseline differences require
> investigation, not blanket tolerance increases. If you conclude a tolerance genuinely must change,
> that needs an explicit measurement and a written justification, not a nudge until green.
>
> Note that SIGN-18 also fails on both platforms. It is unrelated, already diagnosed on the board,
> and not yours.
