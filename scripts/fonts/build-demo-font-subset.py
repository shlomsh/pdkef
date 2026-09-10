#!/usr/bin/env python3
"""
Build the homepage hero demo's display-only 'Caveat Demo' font, a Latin-range
subset of the bundled `public/fonts/Caveat-Bold.ttf`.

This is a **build-time** tool, run by hand, following the same hand-run
pattern as `scripts/fonts/build-cjk-subset.py` (see that file's own docstring
for the general shape of this kind of script). The output TTF is committed to
`public/fonts/` like every other bundled face.

## Why this font exists at all

`Caveat-Bold.ttf` (303,088 bytes) is used twice: as the Sign editor's `Caveat`
bold handwriting face (`src/styles/editorFonts.css`, registered in
`scripts/font-manifest.mjs`, embedded into exported PDFs by `signPdf` via
fontkit), and, separately, as the desktop homepage hero demo's handwritten
caption font (`src/components/HeroDemo/HeroDemo.module.css`, declared there
under the distinct family name `'Caveat Demo'`). Only the second use is on the
homepage's critical rendering path, and PageSpeed flagged the full 157KB
transfer sitting on it. **The editor's `Caveat-Bold.ttf` itself must never be
modified, resubset, or re-encoded** - the export path subsets it per document
with fontkit, so its glyph set has to stay the full file. This script instead
produces a **second, separate** TTF that only the homepage demo references,
leaving every editor reference to the original file untouched.

## Why a Latin range, not the exact caption text

A subset built from only the characters in today's caption copy would be a few
KB smaller, but it would mean a future copy edit to the caption silently
starts rendering missing glyphs in the fallback face (`'Comic Sans MS',
cursive` - see the `@font-face` block in `HeroDemo.module.css`) with nothing
in the build to catch it. Subsetting to a whole Latin range instead means any
plausible future English (or other Latin-script) caption keeps working
without anyone having to remember to rebuild this file.

## Character set

`DEMO_LATIN_CODEPOINTS` below is Basic Latin + Latin-1 Supplement + (almost
all of) Latin Extended-A - `Caveat-Bold.ttf`'s own cmap happens to cover
U+00A0-U+017E contiguously (verified by the `missing` check in `main()`
below), so this range costs nothing in "requested but absent from the
upstream font" surprises. `DEMO_PUNCTUATION_CODEPOINTS` is an explicit,
by-name list of the General Punctuation / currency / symbol codepoints a
marketing caption realistically reaches for (dashes, quotation marks,
ellipsis, bullet, per mille, primes, guillemets, euro sign, trademark, minus
sign) - each one individually verified present in the upstream font, not a
guessed range. Ligature/stylistic-alternate glyphs (small caps, fractions,
sub/superscript digits, `ss01`/`ss02`) are deliberately not retained: this is
a short caption, not body text needing OpenType stylistic features, and
dropping their GSUB features (see LAYOUT_FEATURES below) trims size.

## What this script does NOT need to worry about

Unlike the CJK build script, this subset is never touched by fontkit: it is
declared only in `HeroDemo.module.css` under the CSS class name `'Caveat
Demo'`, which is not in the Sign editor's font catalogue
(`src/editor/text/fontManifest.js`) and is never passed to `signPdf`. So there
is no editor-vs-export shaping-parity concern here (contrast
`build-cjk-subset.py`'s GPOS-dropping rationale) - GPOS (kern/mark/mkmk) is
kept, since only a browser ever rasterises this file.

## `glyf` alignment

`scripts/check-font-glyf-alignment.js` (`npm run test:fonts`) fails the build
on any bundled TTF with an odd `loca` offset - see that script's own comment
for why an unaligned `glyf` table silently corrupts a fontkit subset. This
font is never subset by fontkit (see above), so that specific failure mode
cannot recur here, but the alignment guard runs over every file in
`public/fonts/` regardless of purpose, so this script still re-pads and
verifies it, exactly like the CJK build script does.

## Attribution

`Caveat Demo` is not a new font: it is a narrower subset of the same
`Caveat-Bold.ttf` bytes already credited under the family name `Caveat` in
`THIRD_PARTY_LICENSES.md` and `src/pages/licenses.astro` (generated from
`scripts/font-manifest.mjs`, the Sign editor's font catalogue). Because this
display-only file is deliberately kept out of that catalogue (it is never
selectable in the editor), it is registered instead in
`scripts/display-only-fonts.mjs`, with `sourceFamily: 'Caveat'` pointing back
at the existing credited entry - see that file's own docstring.

Usage:
    pip install fonttools
    python3 scripts/fonts/build-demo-font-subset.py --out public/fonts

Requires fonttools. Verified with 4.63.0.
"""
import argparse
import sys
from pathlib import Path

# Basic Latin (printable) + Latin-1 Supplement + Latin Extended-A. Caveat-Bold's
# own cmap covers U+00A0-U+017E as one contiguous run (confirmed against the
# real file below), so this whole range is free of "requested but not in the
# upstream font" gaps. U+007F-U+009F (C0/C1 controls) are intentionally
# excluded - not printable text.
LATIN_RANGES = [
    (0x0020, 0x007E),  # Basic Latin
    (0x00A0, 0x017E),  # Latin-1 Supplement + most of Latin Extended-A
]

# General Punctuation / currency / math symbols a marketing caption realistically
# reaches for, named explicitly (not a range) because the General Punctuation
# block also carries characters (e.g. combining marks, invisible separators)
# this display font has no reason to carry. Every codepoint here is verified
# present in the upstream Caveat-Bold.ttf cmap by the "upstream font lacks..."
# check in main() below.
DEMO_PUNCTUATION_CODEPOINTS = {
    0x2010,  # hyphen
    0x2011,  # non-breaking hyphen
    0x2013,  # en dash
    0x2014,  # em dash
    0x2018,  # left single quotation mark
    0x2019,  # right single quotation mark (also the typographic apostrophe)
    0x201A,  # single low-9 quotation mark
    0x201C,  # left double quotation mark
    0x201D,  # right double quotation mark
    0x201E,  # double low-9 quotation mark
    0x2020,  # dagger
    0x2021,  # double dagger
    0x2022,  # bullet
    0x2026,  # horizontal ellipsis
    0x2030,  # per mille sign
    0x2032,  # prime
    0x2033,  # double prime
    0x2039,  # single left-pointing angle quotation mark
    0x203A,  # single right-pointing angle quotation mark
    0x20AC,  # euro sign
    0x2122,  # trademark sign
    0x2212,  # minus sign
}

SOURCE_FILE = "Caveat-Bold.ttf"
OUTPUT_FILE = "CaveatDemo-Bold.ttf"

# Kept minimal on purpose: kern/mark/mkmk (GPOS) for legible accent and pair
# positioning, ccmp/liga/calt/locl (GSUB) for standard shaping. Stylistic
# alternates and numeric-form features (aalt, case, dlig, frac, ordn, salt,
# ss01, ss02, subs, sups) are dropped - not needed for a short caption, and
# dropping their GSUB features trims glyphs and lookups those features alone
# would otherwise keep reachable.
LAYOUT_FEATURES = "ccmp,locl,liga,calt,kern,mark,mkmk"


def assert_glyf_aligned(font, path):
    """Fail loudly if any `loca` offset is odd - mirrors
    scripts/check-font-glyf-alignment.js and scripts/fonts/build-cjk-subset.py's
    identically named check. See either file's comments for why an unaligned
    `glyf` table matters."""
    offsets = font["loca"].locations
    odd = sum(1 for o in offsets if o % 2)
    if odd:
        sys.exit(f"{path}: {odd} of {len(offsets)} loca offsets are odd - re-run with padding fixed")


def main() -> None:
    from fontTools.ttLib import TTFont
    from fontTools import subset

    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, type=Path, help="Directory to write the subset TTF into (normally public/fonts)")
    ap.add_argument("--source-dir", default=Path("public/fonts"), type=Path,
                     help="Directory containing the full Caveat-Bold.ttf to subset from (default: public/fonts)")
    args = ap.parse_args()

    source_path = args.source_dir / SOURCE_FILE
    if not source_path.exists():
        sys.exit(f"{source_path} not found - this script subsets the already-bundled editor font, it does not fetch one.")

    chars = set()
    for a, b in LATIN_RANGES:
        chars.update(chr(cp) for cp in range(a, b + 1))
    chars.update(chr(cp) for cp in DEMO_PUNCTUATION_CODEPOINTS)
    print(f"requested {len(chars):,} codepoints ({len(LATIN_RANGES)} Latin ranges + {len(DEMO_PUNCTUATION_CODEPOINTS)} named punctuation marks)")

    upstream = TTFont(source_path, lazy=True)
    upstream_cmap = set(upstream.getBestCmap())
    missing = sorted(c for c in chars if ord(c) not in upstream_cmap)
    if missing:
        sys.exit(f"upstream {SOURCE_FILE} lacks {len(missing)} requested characters: {''.join(missing)!r}")

    args.out.mkdir(parents=True, exist_ok=True)
    dest = args.out / OUTPUT_FILE
    charfile = dest.with_suffix(".chars.txt")
    charfile.write_text("".join(sorted(chars)), encoding="utf-8")
    try:
        subset.main([
            str(source_path),
            f"--text-file={charfile}",
            f"--output-file={dest}",
            f"--layout-features={LAYOUT_FEATURES}",
            "--name-IDs=*", "--name-legacy", "--notdef-outline",
        ])
    finally:
        charfile.unlink(missing_ok=True)

    # Rename the internal `name` table so this file never claims to be plain
    # "Caveat" - the CSS @font-face in HeroDemo.module.css supplies the
    # display name ('Caveat Demo') independently of this, but a font
    # inspector or a future debugging session should not see two files both
    # self-identifying as "Caveat Bold" with different byte counts.
    t = TTFont(dest)
    RENAMES = {1: "Caveat Demo", 2: "Bold", 4: "Caveat Demo Bold", 6: "CaveatDemo-Bold", 16: "Caveat Demo", 17: "Bold"}
    for name_id, value in RENAMES.items():
        t["name"].setName(value, name_id, 3, 1, 0x409)  # Windows, Unicode BMP, English (US)
        t["name"].setName(value, name_id, 1, 0, 0)      # Mac, Roman, English
    t.save(dest)

    # Point 4 from build-cjk-subset.py's docstring: pyftsubset preserves
    # upstream loca alignment, and an odd offset silently corrupts a later
    # fontkit subset. Not reachable via fontkit here (see module docstring),
    # but the repo-wide glyf-alignment guard checks every bundled font
    # regardless, so keep this file honest the same way.
    t = TTFont(dest)
    t["glyf"].padding = 4
    t.save(dest)

    t = TTFont(dest)
    assert_glyf_aligned(t, dest)
    cmap = set(t.getBestCmap())
    gaps = [c for c in chars if ord(c) not in cmap]
    assert not gaps, f"{len(gaps)} requested characters missing from the subset: {''.join(gaps[:40])!r}"

    size = dest.stat().st_size
    source_size = source_path.stat().st_size
    print(f"wrote {dest} ({size:,} bytes, {t['maxp'].numGlyphs:,} glyphs, {len(cmap):,} codepoints)")
    print(f"source {source_path} was {source_size:,} bytes - subset is {size / source_size:.1%} of that")


if __name__ == "__main__":
    main()
