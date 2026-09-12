#!/usr/bin/env python3
"""
Build the homepage hero demo's display-only 'Gveret Levin Demo' font, a
Hebrew-range subset of the bundled editor face `public/fonts/GveretLevin-Regular.ttf`.

Same hand-run pattern as `scripts/fonts/build-demo-font-subset.py` (that
script's own docstring has the general shape); this is its Hebrew sibling for
LOC-09's `/he/` hero caption, not a replacement for it - the English caption
keeps using 'Caveat Demo'.

## Why this font exists at all

`GveretLevin-Regular.ttf` (56,664 bytes) is already bundled and registered in
`scripts/font-manifest.mjs` as the Sign editor's Hebrew handwriting fallback
(`fonts-and-text.md`: "Latin-only handwriting faces ... send Hebrew to Gveret
Levin"). The homepage hero demo's desktop caption (`HeroDemo.module.css`'s
`.caption`) used the Latin-only 'Caveat Demo' face for both languages, which
has no Hebrew glyphs at all - the Hebrew edition's caption fell back to the
generic `cursive` keyword, losing the handwritten-note treatment entirely.
This script produces a **second, separate** TTF under its own family name
('Gveret Levin Demo'), used only by the Hebrew caption, exactly mirroring how
'Caveat Demo' is a separate file from the editor's own `Caveat-Bold.ttf`. The
editor's `GveretLevin-Regular.ttf` itself must never be modified or resubset
in place - it is subset per document, at export time, by fontkit, and needs
its full glyph set.

## Character set

The full font is only 218 glyphs already, so the size win here is modest
compared to Caveat Demo's Latin trim - this subset exists for consistency
with the established display-only pattern (a page's critical caption font
carries only what a caption could plausibly need) and to drop the Hebrew
presentation-form ligature block, not to chase a large byte count.

`HEBREW_RANGES` below is every sub-range the upstream font's own cmap
actually covers within the standard Hebrew block: niqqud (vowel points),
Hebrew letters, and the small Hebrew punctuation range (U+05F0-U+05F4,
Yiddish digraphs / gershayim). Unassigned codepoints in that block (cantillation
marks, U+05A0-U+05AF) are not requested, so the upstream-coverage check in
main() never has anything to complain about. Hebrew presentation forms
(U+FB1D-U+FB4F: precomposed niqqud+letter ligatures and Yiddish digraphs) are
deliberately excluded - a short caption typed as plain Hebrew letters plus
niqqud never reaches for a precomposed ligature glyph, the same call
`build-demo-font-subset.py` makes for Latin Extended-A.

Basic Latin is kept for punctuation (comma, period) already used in the
existing Hebrew caption copy, and `HEBREW_PUNCTUATION_CODEPOINTS` is an
explicit, individually-verified list of the general-punctuation and currency
marks upstream actually carries - notably the Israeli shekel sign (U+20AA),
absent from `build-demo-font-subset.py`'s Latin list because Caveat itself
does not carry it.

Usage:
    pip install fonttools
    python3 scripts/fonts/build-hebrew-demo-font-subset.py --out public/fonts

Requires fonttools. Verified with 4.63.0.
"""
import argparse
import sys
from pathlib import Path

# Basic Latin (printable) - shared punctuation (comma, period, parens) a
# Hebrew caption still reaches for. No Latin-1 Supplement here: unlike an
# English marketing caption, a Hebrew one has no plausible reason to need
# accented Latin letters.
LATIN_RANGES = [
    (0x0020, 0x007E),  # Basic Latin
]

# Every sub-range the upstream GveretLevin-Regular.ttf cmap actually covers
# within the standard Hebrew Unicode block (U+0590-U+05FF) - see the module
# docstring for why the gaps between these are deliberately not requested.
HEBREW_RANGES = [
    (0x05B0, 0x05BC),  # niqqud (vowel points)
    (0x05BE, 0x05C3),  # maqaf, punctuation, more niqqud
    (0x05C6, 0x05C7),  # nun hafukha, qamats qatan
    (0x05D0, 0x05EA),  # the 27 Hebrew letters (22 letters + 5 final forms)
    (0x05F0, 0x05F4),  # Yiddish digraphs, gershayim, geresh
]

# General Punctuation / currency symbols verified present in the upstream
# font's cmap - narrower than build-demo-font-subset.py's Latin list (that
# script's dagger/per-mille/prime/guillemet marks are absent here), plus the
# Israeli shekel sign, which a Hebrew caption is more likely to reach for
# than Caveat's Latin list ever would.
HEBREW_PUNCTUATION_CODEPOINTS = {
    0x2013,  # en dash
    0x2014,  # em dash
    0x2018,  # left single quotation mark
    0x2019,  # right single quotation mark (also the typographic apostrophe)
    0x201A,  # single low-9 quotation mark
    0x201C,  # left double quotation mark
    0x201D,  # right double quotation mark
    0x201E,  # double low-9 quotation mark
    0x2022,  # bullet
    0x2026,  # horizontal ellipsis
    0x20AA,  # new shekel sign
    0x20AC,  # euro sign
    0x2122,  # trademark sign
    0x2212,  # minus sign
}

SOURCE_FILE = "GveretLevin-Regular.ttf"
OUTPUT_FILE = "GveretLevinDemo-Regular.ttf"

# Same feature set as build-demo-font-subset.py, for the same reasons - mark/
# mkmk matters more here than it did for Caveat, since niqqud are combining
# marks positioned over a base letter via GPOS.
LAYOUT_FEATURES = "ccmp,locl,liga,calt,kern,mark,mkmk"


def assert_glyf_aligned(font, path):
    """Mirrors build-demo-font-subset.py's identically named check - see that
    file's comments for why an unaligned `glyf` table matters."""
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
                     help="Directory containing the full GveretLevin-Regular.ttf to subset from (default: public/fonts)")
    args = ap.parse_args()

    source_path = args.source_dir / SOURCE_FILE
    if not source_path.exists():
        sys.exit(f"{source_path} not found - this script subsets the already-bundled editor font, it does not fetch one.")

    chars = set()
    for a, b in LATIN_RANGES + HEBREW_RANGES:
        chars.update(chr(cp) for cp in range(a, b + 1))
    chars.update(chr(cp) for cp in HEBREW_PUNCTUATION_CODEPOINTS)
    print(f"requested {len(chars):,} codepoints ({len(LATIN_RANGES)} Latin range, {len(HEBREW_RANGES)} Hebrew ranges + {len(HEBREW_PUNCTUATION_CODEPOINTS)} named punctuation marks)")

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
    # "Gveret Levin" - the CSS @font-face in HeroDemo.module.css supplies the
    # display name ('Gveret Levin Demo') independently of this, but a font
    # inspector or a future debugging session should not see two files both
    # self-identifying as "Gveret Levin Regular" with different byte counts.
    t = TTFont(dest)
    RENAMES = {1: "Gveret Levin Demo", 2: "Regular", 4: "Gveret Levin Demo", 6: "GveretLevinDemo-Regular", 16: "Gveret Levin Demo", 17: "Regular"}
    for name_id, value in RENAMES.items():
        t["name"].setName(value, name_id, 3, 1, 0x409)  # Windows, Unicode BMP, English (US)
        t["name"].setName(value, name_id, 1, 0, 0)      # Mac, Roman, English
    t.save(dest)

    # loca alignment: pyftsubset preserves upstream alignment, and an odd
    # offset silently corrupts a later fontkit subset. Not reachable via
    # fontkit here (this file is never re-subset at export time), but
    # check-font-glyf-alignment.js checks every bundled TTF regardless.
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
