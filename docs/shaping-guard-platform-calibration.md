# Shaping guard platform calibration (SIGN-19)

**Status:** resolved 2026-08-29. Opened from CI run
[33242665616](https://github.com/shlomsh/pdkef/actions/runs/33242665616) on `b4ffd96`.
The decision and the measurements behind it are in §5a and §5b; §1-§4 are the
original brief, kept as written so the reasoning can be checked against what was
believed at the time. **§3 and §5's "prefer the tighter floor" advice were both
partly wrong, and §5a says exactly how.**

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

---

## 5a. The decision

**Option 1, pin the runner - but only for the export render guard's baseline.
The per-script shaping guards were made platform-*portable* instead, which none
of the three options in §5 contemplated, because the premise those options
shared turned out to be false.**

That premise was that each platform has its own irreducible rasteriser noise and
the only question is which one to calibrate against. It is not one noise. It is
**two artefacts with different causes**, and once they are separated, one of them
can be deleted outright rather than calibrated around.

### The measurement that changed the answer

Reproduced on the CI runner (probe branch, runs
[33244483740](https://github.com/shlomsh/pdkef/actions/runs/33244483740),
[33244933972](https://github.com/shlomsh/pdkef/actions/runs/33244933972),
[33245337653](https://github.com/shlomsh/pdkef/actions/runs/33245337653)),
against the same probe run locally on macOS 15. Exact reproduction: Arabic 18/151,
Pashto 9/22, Bengali 2/259.

**Artefact 1 - glyph rasteriser mismatch.** `fillText` draws from Skia's cached
glyph *bitmaps*; the reconstruction fills outlines through `Path2D`. Two
rasterisers, so they disagree along every antialiased edge. Dominant on macOS
(Arabic floor 14.89%), minor on Linux (2.76%).

**Artefact 2 - advance quantisation.** Linux Chromium reports whole-pixel
`measureText` advances; macOS reports advances that equal fontkit's to floating
point. Measured, on the same strings:

| string | glyphs | macOS `measureText` | Linux `measureText` | fontkit |
| --- | --- | --- | --- | --- |
| `ا` | 1 | 16.836 | 17.000 | 16.836 |
| `مرحبا` | 5 | 149.531 | 151.000 | 149.531 |
| `الجمهورية العربية` | 17 | 483.008 | 481.000 | 483.008 |

macOS agrees with fontkit on **151 of 151** Arabic cases at `widthDiff` 0.00.
Linux is integral on **40 of 40** sampled strings. The error is per glyph and
**accumulates**, which is why the failures sort by string length: on Linux the
median diff runs 0.41% at one glyph, 1.42% at two, 12.02% at four, 17.59% at
nine, 24.74% at seventeen.

That accumulation is exactly what the calibration set could not see, because
every calibration string was **one glyph long**. Measured directly, on
zero-ambiguity ink of increasing length, Linux at the old size:

| glyphs | 1 | 2 | 5 | 9 | 13 | 17 |
| --- | --- | --- | --- | --- | --- | --- |
| max diff | 1.35% | 10.30% | 9.38% | 13.23% | 15.14% | 17.13% |

So the "2.76% floor" was never a floor for the ink being judged. It measured a
regime the corpus barely contains.

### What was done about each

**Artefact 1 is removable, and was removed.** Above Skia's bitmap-glyph size
limit (~256px), `fillText` rasterises through the *path* rasteriser - the same
one `Path2D` uses. Rendering the guards there collapses the term to zero:

| guard | old floor (macOS / Linux) | new floor (macOS / Linux) | old tolerance | new tolerance |
| --- | --- | --- | --- | --- |
| Arabic, Pashto | 14.89% / 2.76% | **0.00% / 0.00%** | 22.33% / 4.14% | **3.00%** |
| Bengali | 9.65% / 5.52% | **0.00% / 1.41%** | 14.48% / 8.27% | **4.00%** |

The threshold was located, not guessed: Scheherazade New is still noisy at 240px
(5.79%) and clean at 320px, and Noto Sans Bengali is already clean at 300px -
two fonts agreeing on where the discontinuity sits. **On macOS this is a 7x
tightening of the Arabic guard**, from a 22.33% tolerance the brief rightly
called close to toothless, to 3.00%. The sabotage control (shape every character
in isolation, i.e. no joining at all) still fails 119 of 151 cases at the new
tolerance, so the power to catch the defect the font was added to fix is intact.

**Artefact 2 is not removable, so it is measured.** It survives every render
size and every configuration tried - `--enable-font-subpixel-positioning`,
`deviceScaleFactor: 2`, `--force-device-scale-factor=2` - all integral, 40/40,
in all of them. The harness now measures its cost directly
(`measureDisplacementFloorPct`): it renders each corpus string's reconstruction
twice from the *same* fontkit output, once at fontkit's exact positions and once
with every pen position rounded to a whole pixel, and diffs those two against
each other. The native rendering is never involved, so this can be measured over
the corpus without circularity - it asks "what does whole-pixel placement cost on
this ink", not "is fontkit right". It reads zero on a platform that does not
quantise, so macOS pays nothing for it, and the platform is detected by sampling
rather than declared.

### Why "prefer the tighter floor" was the wrong rule

§5 says to prefer whichever platform yields the tighter floor. Applied here that
would have picked Linux's 2.76% over macOS's 14.89% - and Linux's number was the
*less* trustworthy of the two, because it was measured on ink that carries none
of the artefact that dominates the cases under test. **Tighter is only better
when the floor is measured on the same kind of ink it judges.** The replacement
rule, now in the harness: *an artefact gets removed from the instrument if it
can be, and measured if it cannot; it never gets absorbed into a hand-picked
tolerance.*

§3 also framed Linux as "the more informative measurement". That was right about
its conclusion (the macOS green was weak evidence) and wrong about its reason.

### The export render guard: Option 1, pinned to Linux

This one really is a platform-bound baseline, and it is a different problem from
the shaping guards. Determinism measured **0.00% on both platforms**, so
`signPdf` produces byte-identical output on both machines and only the pdf.js
rasterisation of two thin handwriting faces differs: `latin-caveat` 13.68% and
`latin-great-vibes` 17.61%, against a 12.50% tolerance.

The harness's own "Tolerance" note anticipated this and said to re-measure on
Linux rather than widen. Re-measured, widening would mean `17.61 x 1.5 = 26.4%`
- more than double the slack, on a guard that already admits "a defect smaller
than an eighth of a case's ink passes". That is not a tolerance any more. So the
tolerance stays at 12.50% and the **baseline is pinned to the CI runner**:
captured there, compared there, and the guard **skips** elsewhere with a message
saying why. A skip is the honest report; a red run everyone learns to ignore is
worse, and a green run against a mismatched baseline is worse still. Capture is
refused off-platform rather than left to discipline, and the workflow has a
`update-export-render-baseline` input that captures on the runner and prints the
file for review.

### One thing this decision explicitly does not say

Linux is the pin because **CI gates releases**, not because it renders the way
anybody's users do. **There are no Linux users** - the platforms are macOS,
Windows, iPhone and Android, and Linux is the build machine. That is what makes
Artefact 2 an instrument defect rather than a fidelity target: no user's editor
quantises advances that way, so calibrating a tolerance around it would have been
calibrating against a machine nobody reads documents on.

## 5b. `স্ক`, judged on its own evidence

**A genuine divergence, and now the fourth entry in
`KNOWN_FONTKIT_DIVERGENCES`.** It is not placement noise, and the brief's
suspicion was right.

- fontkit emits `uni09B809CD.half` + `baphalabeng.alt4` + `uni0995.part`, with
  **no `headlinebeng.*` component** - unlike its neighbours `স্ব` and `হ্ন`,
  which do get one. Rendered at 400px the conjunct is visibly missing the
  headline over its right-hand KA part, and that part is a detached blob rather
  than a connected hook. Judged by eye, not by a percentage.
- Total advance 64.00px against Chromium's 74.50px, a **14% under-report**. In
  an exported PDF that puts whatever follows 10.5px too far left.
- Identical on both platforms (Linux reads 75.00 only because it rounds), so it
  is the shaper, not the runner.
- Its neighbours are fine - `স্ব` agrees to 0.5px, `স্ত` and `শ্চ` exactly - so
  it is one cluster, not a broken feature.

**A fifth was found in the process.** `preBaseVowel:ট+vowelSignI` ("টি") had been
sitting at 13.78% against a 14.48% tolerance on macOS - passing by 0.7 points,
which was never evidence of anything - and it fails cleanly once the rasteriser
noise is removed. Advance agrees exactly and the pre-base reordering is correct;
fontkit misplaces the `uni099F.flag` component on the retroflex TTA body.

Per CLAUDE.md's standing rule that a fourth divergence re-opens the keep-or-drop
question rather than extending the list silently, **that decision was re-opened
and re-taken: keep Noto Sans Bengali.** Five of 262 generated cases is 1.9%,
against the 88% systemic disagreement that got Playpen Sans Hebrew dropped. The
five are narrow, enumerable, and **three of them (ট্র, ঠ্র, টি) are one nameable
weakness** - fontkit misplacing a component part attached to a retroflex
consonant. All five are named to users in the Sign page's Bengali FAQ.

## 5c. A gap this leaves open, tracked as SIGN-20

Separately from `স্ক`, the probe found conjuncts where fontkit's **advance** is
badly wrong while its **ink** matches Chromium closely - `হ্ন` 53.40 vs 74.40px
(21px), `ক্ত` 71.00 vs 91.00px (20px), `দ্ধ` 53.10 vs 64.60px (11.5px), all
platform-independent. A pixel diff of one string in isolation barely sees this,
because the disagreement is in trailing advance where there is no ink: `হ্ন`
scores 6.16% while under-reporting its width by 28%. In a real export it would
overlap whatever follows.

These are **not** excluded from the corpus - they pass the guard honestly on what
it measures. The gap is in the method, not in the corpus, and closing it means an
advance-parity assertion alongside the pixel one. Tracked as SIGN-20 (low
priority) rather than folded in here, so that it is a deliberate piece of work
with its own evidence.

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
