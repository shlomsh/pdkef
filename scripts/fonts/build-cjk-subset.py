#!/usr/bin/env python3
"""
Build the bundled Noto Sans JP subset from the upstream variable font.

This is a **build-time** tool, run by hand when the font is added or refreshed,
not part of `npm run build` - the output TTFs are committed to public/fonts/
like every other bundled face. It exists because a full CJK face is 5-20MB and
we only need the characters a Japanese name or form entry uses.

The original version of this file said the export keeps `subset: false`
because the runtime subsetter is broken for CJK. **That is no longer true, and
the real distinction turned out to be finer than "CJK".** The export now
embeds with `{ subset: true }` (CLAUDE.md, "Fonts are subsetted on export"),
so the ~1MB face shipped here is subsetted again at download time to the
handful of glyphs actually drawn - measured, four kanji cost about 900 bytes.
What genuinely breaks fontkit's TTF subsetter is not CJK, not CFF and not
variable fonts: it is a `glyf` table whose outlines are not 2-byte aligned,
which is why step 3 below exists.

Three things here are load-bearing, each measured rather than assumed:

1. **Instance to a static weight first.** The upstream file is a `wght`
   variable font whose *default instance is 100 (Thin)*, not 400 - subsetting
   it without pinning would ship a Thin face under the name "Regular".

2. **Drop GPOS entirely.** Noto Sans JP carries kana pair kerning that fontkit
   applies and Chromium/HarfBuzz does not (measured: `たろ` shapes to 1940
   units in fontkit against the browser's 2000; `アイ` 1950 against 2000, while
   Latin `VA`/`Yamada` agree on both sides). The editor paints with the browser
   and the PDF is emitted at fontkit's advances, so keeping `kern` means the
   download is ~1% narrower than the screen on any kana run - the same
   screen-vs-export divergence class that got Playpen Sans Hebrew dropped from
   this catalogue. With GPOS gone both sides advance by `hmtx` and cannot
   disagree. The cost is Latin pair kerning inside a CJK text box, which is
   where this face's Latin is used at all.

3. **Pad `glyf` to 4 bytes before writing.** `pyftsubset` preserves the
   upstream's byte alignment, and these subsets came out with 1,788 (Regular)
   and 1,832 (Bold) odd `loca` offsets. fontkit's TTF subsetter reads each
   outline at the offset `loca` gives it, so an odd offset makes it read the
   wrong bytes - measured on this exact file before the fix, subsetting the
   name '山田太郎' reduced 郎 to an **empty glyph**: a name silently losing
   its last character in a signing app, with no error anywhere. Whole-font
   checks miss it (the font parses, renders and extracts fine), and so does a
   single-glyph probe, because the misalignment only bites once enough glyphs
   follow it. `npm run test:fonts` checks the property directly, over every
   bundled font.

4. **Drop the vertical-writing features and tables** (`vert`, `vrt2`, `vhal`,
   `vkrn`, `vpal`, `vhea`, `vmtx`). Nothing in this app lays out vertical
   Japanese, and an unrequested feature that only one of the two renderers
   might reach for is divergence surface for no benefit.

Character set: jōyō kanji (2,136 - the standard taught set) + jinmeiyō kanji
(863 - the set legally permitted in Japanese personal names, which is precisely
what a form-signing tool needs) + kana + CJK/fullwidth punctuation + Latin +
digits. Anything outside it hits the existing while-typing "no bundled font can
draw this" notice, which is the designed behaviour rather than a new failure
mode.

The kanji lists are derived from KANJIDIC2's `grade` field (1-6 and 8 are
jōyō, 9 and 10 are jinmeiyō) and cross-checked against the official counts, so
a refresh re-derives them rather than trusting a copied list. KANJIDIC2 is used
only as a source of *which characters exist in a government-published list*;
nothing from it is redistributed.

Usage:
    python3 scripts/fonts/build-cjk-subset.py --work-dir /tmp/cjk --out public/fonts

Requires fonttools (`pip install fonttools`). Verified with 4.63.0.
"""
import argparse, gzip, json, sys, urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

VAR_FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf"
LICENSE_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/OFL.txt"
KANJIDIC_URL = "http://www.edrdg.org/kanjidic/kanjidic2.xml.gz"

# Official counts, asserted so a KANJIDIC2 refresh that changes the lists is
# loud rather than silent.
JOYO_COUNT, JINMEIYO_COUNT = 2136, 863

# Non-kanji ranges. Deliberately narrow: every range here is one the font
# genuinely covers, checked by --verify below. U+302A-302F (Hangul tone marks)
# are excluded from the CJK punctuation block on purpose - they are combining
# marks irrelevant to Japanese, and they are the only codepoints in these
# ranges where fontkit's zero advance and the browser's fallback disagree.
RANGES = [
    (0x0020, 0x007E),                                        # ASCII
    (0x00A5, 0x00A5), (0x00B0, 0x00B0), (0x00D7, 0x00D7), (0x00F7, 0x00F7),
    (0x2010, 0x2015), (0x2018, 0x2019), (0x201C, 0x201D),
    (0x2025, 0x2026), (0x2030, 0x2030), (0x2032, 0x2033), (0x203B, 0x203B),
    (0x2103, 0x2103), (0x212B, 0x212B), (0x2190, 0x2193), (0x21D2, 0x21D2), (0x21D4, 0x21D4),
    (0x2200, 0x2200), (0x2202, 0x2203), (0x2208, 0x220B), (0x221A, 0x221A),
    (0x221D, 0x221E), (0x2220, 0x2220), (0x2227, 0x222E), (0x2234, 0x2235),
    (0x223D, 0x223D), (0x2260, 0x2261), (0x2266, 0x2267),
    (0x226A, 0x226B), (0x2282, 0x2287),
    (0x25A0, 0x25A1), (0x25B2, 0x25B3), (0x25BC, 0x25BD), (0x25C6, 0x25C7),
    (0x25CB, 0x25CB), (0x25CE, 0x25CF), (0x2605, 0x2606),
    (0x3000, 0x3029), (0x3030, 0x303F),                      # CJK punctuation, minus tone marks
    (0x3041, 0x3096), (0x3099, 0x309F),                       # hiragana (3097/3098 unassigned)
    (0x30A0, 0x30FF),                                        # katakana
    (0xFF01, 0xFF60),                                        # fullwidth forms
    (0xFF61, 0xFF9F),                                        # halfwidth katakana
    (0xFFE0, 0xFFE5),
]

WEIGHTS = {"Regular": 400, "Bold": 700}
# pyftsubset's default keeps a broad set; this is the explicit minimum. `ccmp`
# and `locl` are the only two that can matter for Japanese, `liga` is retained
# for the Latin portion. No `calt` - the font does not carry one, which is
# itself a precondition for this catalogue (see CLAUDE.md).
LAYOUT_FEATURES = "ccmp,locl,liga"
DROP_TABLES = "vhea,vmtx,BASE,STAT,MVAR,GPOS"


def fetch(url: str, dest: Path) -> Path:
    if dest.exists():
        print(f"  reuse  {dest.name} ({dest.stat().st_size:,} bytes)")
        return dest
    print(f"  fetch  {url}")
    with urllib.request.urlopen(url) as r:
        dest.write_bytes(r.read())
    print(f"         -> {dest.name} ({dest.stat().st_size:,} bytes)")
    return dest


def kanji_lists(work: Path) -> tuple[list[str], list[str]]:
    path = fetch(KANJIDIC_URL, work / "kanjidic2.xml.gz")
    root = ET.fromstring(gzip.open(path, "rb").read())
    by_grade = defaultdict(list)
    for c in root.iter("character"):
        grade = c.find("misc/grade")
        if grade is not None:
            by_grade[grade.text].append(c.find("literal").text)
    joyo = sorted(sum((by_grade[str(g)] for g in (1, 2, 3, 4, 5, 6, 8)), []))
    jinmeiyo = sorted(by_grade["9"] + by_grade["10"])
    if len(joyo) != JOYO_COUNT or len(jinmeiyo) != JINMEIYO_COUNT:
        sys.exit(f"KANJIDIC2 gave {len(joyo)} jōyō / {len(jinmeiyo)} jinmeiyō, "
                 f"expected {JOYO_COUNT} / {JINMEIYO_COUNT} - the source changed, check before shipping.")
    print(f"  kanji  {len(joyo)} jōyō + {len(jinmeiyo)} jinmeiyō")
    return joyo, jinmeiyo


def assert_glyf_aligned(font, path):
    """Fail loudly if any `loca` offset is odd - the defect described in point
    3 of the module docstring. Mirrors scripts/check-font-glyf-alignment.js,
    which enforces the same property over every bundled font at build time."""
    offsets = font["loca"].locations
    odd = sum(1 for o in offsets if o % 2)
    if odd:
        sys.exit(f"{path}: {odd} of {len(offsets)} loca offsets are odd - "
                 "fontkit's subsetter will emit blank glyphs from this font")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--work-dir", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()
    work, out = args.work_dir, args.out
    work.mkdir(parents=True, exist_ok=True)

    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
    from fontTools import subset

    print("sources")
    var_path = fetch(VAR_FONT_URL, work / "NotoSansJP-var.ttf")
    fetch(LICENSE_URL, work / "NotoSansJP-OFL.txt")
    joyo, jinmeiyo = kanji_lists(work)

    chars = set(joyo) | set(jinmeiyo)
    for a, b in RANGES:
        chars.update(chr(cp) for cp in range(a, b + 1))
    charfile = work / "subset-chars.txt"
    charfile.write_text("".join(sorted(chars)), encoding="utf-8")
    print(f"  chars  {len(chars):,} requested")

    upstream = TTFont(var_path, lazy=True)
    upstream_cmap = set(upstream.getBestCmap())
    missing = sorted(c for c in chars if ord(c) not in upstream_cmap)
    if missing:
        sys.exit(f"upstream font lacks {len(missing)} requested characters: {''.join(missing)}")

    out.mkdir(parents=True, exist_ok=True)
    for style, wght in WEIGHTS.items():
        print(f"\n{style} (wght={wght})")
        static = work / f"NotoSansJP-{style}-static.ttf"
        if not static.exists():
            f = TTFont(var_path)
            instancer.instantiateVariableFont(f, {"wght": wght}, inplace=True, updateFontNames=True)
            f.save(static)
        print(f"  static {static.stat().st_size:,} bytes")

        dest = out / f"NotoSansJP-{style}.ttf"
        subset.main([
            str(static),
            f"--text-file={charfile}",
            f"--output-file={dest}",
            f"--layout-features={LAYOUT_FEATURES}",
            f"--drop-tables+={DROP_TABLES}",
            "--no-hinting", "--desubroutinize",
            "--name-IDs=*", "--name-legacy", "--notdef-outline",
        ])

        # Point 3 in the module docstring: pyftsubset keeps the upstream's
        # alignment, and unaligned outlines subset into blank glyphs at export.
        t = TTFont(dest)
        t["glyf"].padding = 4
        t.save(dest)

        t = TTFont(dest)
        assert_glyf_aligned(t, dest)
        cmap = set(t.getBestCmap())
        gsub = sorted({r.FeatureTag for r in t["GSUB"].table.FeatureList.FeatureRecord}) if "GSUB" in t else []
        assert "GPOS" not in t, "GPOS survived the subset - kana kerning would diverge from the browser"
        assert "calt" not in gsub, "calt survived the subset"
        for name, lst in (("jōyō", joyo), ("jinmeiyō", jinmeiyo)):
            gaps = [c for c in lst if ord(c) not in cmap]
            assert not gaps, f"{name} characters missing from the subset: {''.join(gaps)}"
        hhea = t["hhea"]
        upem = t["head"].unitsPerEm
        print(f"  subset {dest.stat().st_size:,} bytes, {t['maxp'].numGlyphs:,} glyphs, "
              f"{len(cmap):,} codepoints, GSUB={gsub}, GPOS=absent")
        print(f"  metrics ascent {hhea.ascent / upem:.3f} descent {abs(hhea.descent) / upem:.3f} "
              f"(FONT_VERTICAL_METRICS values)")

    print(f"\nwrote {out}/NotoSansJP-Regular.ttf and NotoSansJP-Bold.ttf")


if __name__ == "__main__":
    main()
