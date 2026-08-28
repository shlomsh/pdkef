#!/usr/bin/env python3
"""
Build the bundled Noto Sans CJK subsets (Japanese, Simplified Chinese,
Traditional Chinese, Korean) from the upstream variable fonts.

This is a **build-time** tool, run by hand when a font is added or refreshed,
not part of `npm run build` - the output TTFs are committed to public/fonts/
like every other bundled face. It exists because a full CJK face is 5-20MB and
we only need the characters a name or form entry uses (measured upstream
sizes: SC 17.8MB, TC 11.9MB, KR 10.4MB, JP was comparable).

Han unification means the four scripts share thousands of codepoints but need
regionally different glyph shapes - a Chinese reader expects Chinese letterform
conventions, not Japanese ones, for a character both languages happen to use -
so **one file cannot honestly serve more than one of these**, and each family
below is built from its own upstream font against its own character set.

Japanese landed first (2026-08-26) and is the model every other family in
FAMILIES follows. Four things proved there are load-bearing and generalize
unchanged; verified empirically for SC/TC/KR before trusting them here rather
than assumed by analogy - see each point below for the family-specific check:

1. **Instance to a static weight first.** Every upstream file here is a `wght`
   variable font whose *default instance is 100 (Thin)*, not 400 - confirmed
   for SC/TC/KR too (`fvar` axis default 100.0 on all three, same as JP).
   Subsetting without pinning would ship a Thin face under the name "Regular".

2. **Drop GPOS entirely.** JP's reason was measured, not assumed: Noto Sans JP
   carries kana pair kerning that fontkit applies and Chromium/HarfBuzz does
   not, so the editor (which paints via the browser) and the export (which
   embeds at fontkit's advances) would silently disagree on any kerned pair.
   SC/TC/KR's upstream GPOS tables carry the same shape of feature set -
   `kern`, `palt`, `mark`, plus vertical-only `vhal`/`vkrn`/`vpal`/`halt` - so
   the same divergence risk applies without a font-specific re-derivation.
   Dropping GPOS means both renderers advance by `hmtx` alone and cannot
   disagree, at the same cost JP already accepted: no Latin pair kerning
   inside a CJK text box.

3. **Drop vertical-writing features and tables** (`vert`, `vrt2`, `vhal`,
   `vkrn`, `vpal`, `vhea`, `vmtx`). Nothing in this app lays out vertical text,
   in any of these four scripts.

4. **Pad `glyf` to 4 bytes and assert alignment.** `pyftsubset` preserves
   upstream `loca` alignment, and JP's subsets came out with hundreds of odd
   offsets, which made fontkit's export-time subsetter reduce a real kanji to
   an *empty glyph* - a name silently losing a character. `assert_glyf_aligned`
   runs on every output file below, for every family, and `npm run test:fonts`
   checks the same property again at CI time over every bundled font.

**A fifth point, new here: Korean's upstream GSUB carries `calt` and the
jamo-composition triad `ljmo`/`vjmo`/`tjmo`** (fonts.js's Hebrew/Arabic/
Devanagari rows exist precisely because a font that reorders or substitutes
glyphs is a different correctness problem than one that only needs advance
parity - see fonts.js and the Devanagari/Arabic shaping guards). None of JP,
SC or TC upstream carries `calt`. This matters only if those features would
survive the subset: they do not, because `LAYOUT_FEATURES` below is an
explicit allowlist (`ccmp,locl,liga`) passed to `--layout-features`, which
*replaces* pyftsubset's default retained-feature set rather than adding to
it - `calt`/`ljmo`/`vjmo`/`tjmo` are not on that list for any family, so they
are dropped along with everything else not named. `verify()` below asserts
the survived GSUB feature set for every family is a subset of
`{ccmp, locl, liga}`, which would fail loudly if that ever stopped being true
(e.g. a future family whose Latin `liga` set pulls in something unwanted).
Korean is still the family to watch on any refresh: it is the one family
where the *upstream* font can compose isolated jamo into a syllable-shaped
glyph sequence at all, so it is the one worth re-checking by hand if this
list ever needs to grow.

Character sets (point 5 the task forced - there is no jōyō/jinmeiyō-shaped
"the" answer for the other three, so each choice below is deliberate and
documented at its own definition site rather than here):

- **Japanese**: unchanged - jōyō + jinmeiyō kanji, see `jp_chars()`.
- **Simplified Chinese**: the Table of General Standard Chinese Characters
  (通用规范汉字表), the PRC Ministry of Education / State Language Commission's
  2013 standard, 8,105 characters total - see `sc_chars()`.
- **Traditional Chinese**: Taiwan's Ministry of Education 常用國字標準字體表
  (1982, 4,808 chars) + 次常用國字標準字體表 (1982, 6,343 chars), 11,151 unique
  characters - see `tc_chars()`.
- **Korean**: the full Unicode Hangul Syllables block (all 11,172 precomposed
  syllables) rather than a trimmed "common" list - see `kr_chars()` for why
  trimming was rejected.

Usage:
    python3 scripts/fonts/build-cjk-subset.py --family jp --work-dir /tmp/cjk --out public/fonts
    python3 scripts/fonts/build-cjk-subset.py --family sc --work-dir /tmp/cjk --out public/fonts
    python3 scripts/fonts/build-cjk-subset.py --family all --work-dir /tmp/cjk --out public/fonts

`--family` is required and defaults to nothing on purpose: JP's output is
already committed and verified against the export-render-guard baseline, so
an accidental re-run must not silently touch it. Pass `jp` explicitly to
rebuild it; `all` builds every family in FAMILIES.

Requires fonttools (`pip install fonttools`). Verified with 4.63.0.
"""
import argparse, gzip, sys, urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

WEIGHTS = {"Regular": 400, "Bold": 700}
# pyftsubset's default keeps a broad set; this is the explicit minimum. `ccmp`
# and `locl` are the only two that can matter for CJK scripts here, `liga` is
# retained for the Latin portion every family also carries. Because this list
# *replaces* pyftsubset's default retained-feature set rather than adding to
# it, anything not named here - notably Korean's `calt`/`ljmo`/`vjmo`/`tjmo` -
# is dropped along with GPOS. See the module docstring's point 5.
LAYOUT_FEATURES = "ccmp,locl,liga"
DROP_TABLES = "vhea,vmtx,BASE,STAT,MVAR,GPOS"

# Non-kanji/non-Hangul ranges shared by every CJK family: ASCII, common
# symbols/punctuation, CJK punctuation and fullwidth forms. Deliberately
# narrow - every range here is one each family's upstream font genuinely
# covers (checked by the "upstream font lacks N requested characters" guard
# in main(), against all four fonts before this was trusted). Kana
# (hiragana/katakana) and halfwidth-katakana ranges are Japanese-only and stay
# in JP_ONLY_RANGES below, not here, so JP's own committed output is
# untouched by this refactor.
COMMON_RANGES = [
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
    (0x3000, 0x3029), (0x3030, 0x303F),                      # CJK punctuation, minus Hangul tone marks
    (0xFF01, 0xFF60),                                        # fullwidth forms
    (0xFFE0, 0xFFE5),
]

# U+302A-302F (Hangul tone marks) are excluded from CJK punctuation on
# purpose for every family, JP included - see the original JP comment history
# - they are combining marks irrelevant outside Middle Korean philology, and
# the one range in this block where fontkit's zero advance and the browser's
# fallback have been observed to disagree.

JP_ONLY_RANGES = [
    (0x3041, 0x3096), (0x3099, 0x309F),                       # hiragana (3097/3098 unassigned)
    (0x30A0, 0x30FF),                                         # katakana
    (0xFF61, 0xFF9F),                                         # halfwidth katakana
]

# Korean-only additions to COMMON_RANGES: the won sign (both forms - U+20A9
# is the plain currency symbol used in running text, U+FFE6 is the fullwidth
# form Noto also carries and Korean typesetting uses in tables/forms) and the
# Hangul Compatibility Jamo block (U+3131-318E, 94 codepoints) - the isolated,
# non-composing consonant/vowel letterforms used to spell out individual jamo
# in dictionaries, phonetic tables and some form labels, distinct from the
# codepoints that make up a precomposed syllable. See kr_chars() for the
# precomposed-syllable block itself and why it is not trimmed.
KR_ONLY_RANGES = [(0x20A9, 0x20A9), (0x3131, 0x318E), (0xFFE6, 0xFFE6)]


def fetch(url: str, dest: Path) -> Path:
    if dest.exists():
        print(f"  reuse  {dest.name} ({dest.stat().st_size:,} bytes)")
        return dest
    print(f"  fetch  {url}")
    with urllib.request.urlopen(url) as r:
        dest.write_bytes(r.read())
    print(f"         -> {dest.name} ({dest.stat().st_size:,} bytes)")
    return dest


# ---------------------------------------------------------------------------
# Per-family character sets. Each function returns (chars, ranges, label) -
# `chars` are the CJK/Hangul characters specific to that family (fetched or
# derived), `ranges` are the (start, end) codepoint ranges to add on top
# (ASCII/punctuation/etc, plus any family-only extras), `label` is a short
# string logged so a build run states in plain text what it built.
# ---------------------------------------------------------------------------

JOYO_COUNT, JINMEIYO_COUNT = 2136, 863
KANJIDIC_URL = "http://www.edrdg.org/kanjidic/kanjidic2.xml.gz"


def jp_chars(work: Path) -> tuple[set[str], list[tuple[int, int]], str]:
    """Japanese: jōyō kanji (2,136 - the standard taught set) + jinmeiyō kanji
    (863 - the set legally permitted in Japanese personal names, which is
    precisely what a form-signing tool needs), derived from KANJIDIC2's
    `grade` field (1-6 and 8 are jōyō, 9 and 10 are jinmeiyō) and cross-checked
    against the official counts, so a refresh re-derives them rather than
    trusting a copied list. KANJIDIC2 is used only as a source of *which
    characters exist in a government-published list*; nothing from it is
    redistributed. Unchanged from the original single-family script."""
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
    return set(joyo) | set(jinmeiyo), COMMON_RANGES + JP_ONLY_RANGES, "jōyō+jinmeiyō kanji"


SC_URL = "https://raw.githubusercontent.com/jaywcjlove/table-of-general-standard-chinese-characters/main/data/characters.txt"
SC_COUNT = 8105


def sc_chars(work: Path) -> tuple[set[str], list[tuple[int, int]], str]:
    """Simplified Chinese: the Table of General Standard Chinese Characters
    (通用规范汉字表), published 2013-06-05 by the PRC Ministry of Education and
    State Language Commission (国家语言文字工作委员会) - the current national
    standard for everyday Chinese, structurally the SC analogue of jōyō: a
    government list, not a frequency ranking. It supersedes the older GB 2312
    and is organized in three tiers (3,500 most-common + 3,000 common + 1,605
    less-common-but-standard, e.g. place-name and technical-term characters),
    but this app doesn't need the tiering, only the union - 8,105 characters,
    which is what personal names and form vocabulary in Simplified Chinese
    actually draw from.

    There is no free-standing machine-readable release of the table from the
    Ministry itself (it was published as a PDF/scan), so this uses
    jaywcjlove/table-of-general-standard-chinese-characters, a community
    digitization cross-referenced by several independent GitHub projects and
    hanzidb.org, the same way KANJIDIC2 is a community-maintained digitization
    of Japan's grade-level standard above - the count assertion below is what
    keeps a bad transcription from shipping silently."""
    path = fetch(SC_URL, work / "sc-characters.txt")
    chars = {c for c in path.read_text(encoding="utf-8") if c.strip()}
    if len(chars) != SC_COUNT:
        sys.exit(f"Table of General Standard Chinese Characters source gave {len(chars)} characters, "
                  f"expected {SC_COUNT} - the source changed, check before shipping.")
    print(f"  hanzi  {len(chars)} (通用规范汉字表, all three tiers)")
    return chars, COMMON_RANGES, "通用规范汉字表 (Table of General Standard Chinese Characters)"


TC_COMMON_URL = "https://raw.githubusercontent.com/ButTaiwan/cjktables/master/taiwan/standard/edu_standard_1.txt"
TC_SECONDARY_URL = "https://raw.githubusercontent.com/ButTaiwan/cjktables/master/taiwan/standard/edu_standard_2.txt"
TC_COMMON_COUNT, TC_SECONDARY_COUNT = 4808, 6343
# Verified 2026-08-27 against the upstream Noto Sans TC[wght] cmap: these four
# 次常用 (secondary-common) characters have no glyph in the upstream font at
# all - not a subsetting artifact, absent from the font this build starts
# from. "The catalogue is ours to curate" (CLAUDE.md): rather than fail the
# whole build over four characters the shipped font cannot draw regardless,
# they are excluded here, by name, so a future upstream release that adds
# them is a one-line diff instead of a silent gap. Missing any of these hits
# the existing while-typing "no bundled font can draw this" notice, same as
# any other uncovered character.
TC_UPSTREAM_GAPS = {"叄", "㚷", "嬎", "㮣"}


def tc_chars(work: Path) -> tuple[set[str], list[tuple[int, int]], str]:
    """Traditional Chinese: Taiwan's Ministry of Education (教育部)
    常用國字標準字體表 ("Standard Form of Common National Characters", 1982,
    4,808 chars, Table A) + 次常用國字標準字體表 ("...Secondary Commonly Used...",
    1982, 6,343 chars, Table B) - the ROC government's own two-tier standard,
    structurally the closest TC analogue to jōyō+jinmeiyō of anything
    published: Table A is the characters taught and used daily, Table B is
    the wider set (many of them personal- and place-name characters) a form
    can still reasonably need. 11,151 unique characters after excluding the
    4 codepoints in TC_UPSTREAM_GAPS the upstream font itself does not carry.

    An alternative considered and rejected: the Big5 encoding's character
    repertoire (~13,053 chars). Big5 is a legacy *encoding*, not a standard
    for which characters are "in use" - it carries several duplicate/variant
    slots for encoding-compatibility reasons unrelated to whether a name would
    plausibly use the character, and it is not government-published the way
    the MOE tables are. The MOE tables are the more principled source and are
    what Taiwanese type foundries and standards docs (see e.g. ButTaiwan's own
    cjktables README) treat as the reference for "which characters does
    written Chinese in Taiwan actually need."

    Digitized by ButTaiwan/cjktables (a Taiwan-focused open font/typography
    project, itself citing the MOE tables and Taiwan's education-ministry
    Wikisource transcription), not fetched directly from the MOE because it
    only publishes a PDF/scan; counts are asserted against the officially
    documented 4,808/6,343 so a bad transcription fails loudly rather than
    shipping."""
    common_path = fetch(TC_COMMON_URL, work / "tc-common.txt")
    secondary_path = fetch(TC_SECONDARY_URL, work / "tc-secondary.txt")

    def parse(path: Path) -> list[str]:
        lines = path.read_text(encoding="utf-8").splitlines()[1:]  # header row
        return [line.split("\t")[0] for line in lines if line.strip()]

    common, secondary = parse(common_path), parse(secondary_path)
    if len(common) != TC_COMMON_COUNT or len(secondary) != TC_SECONDARY_COUNT:
        sys.exit(f"MOE standard tables gave {len(common)} 常用 / {len(secondary)} 次常用, "
                  f"expected {TC_COMMON_COUNT} / {TC_SECONDARY_COUNT} - the source changed, check before shipping.")
    chars = (set(common) | set(secondary)) - TC_UPSTREAM_GAPS
    print(f"  hanzi  {len(common)} 常用 + {len(secondary)} 次常用, "
          f"{len(chars)} unique after excluding {len(TC_UPSTREAM_GAPS)} chars absent from upstream")
    return chars, COMMON_RANGES, "常用國字標準字體表 + 次常用國字標準字體表 (Taiwan MOE)"


HANGUL_SYLLABLES = (0xAC00, 0xD7A3)  # precomposed syllable block, 11,172 codepoints
HANGUL_SYLLABLE_COUNT = HANGUL_SYLLABLES[1] - HANGUL_SYLLABLES[0] + 1


def kr_chars(work: Path) -> tuple[set[str], list[tuple[int, int]], str]:
    """Korean: the full Unicode Hangul Syllables block (U+AC00-D7A3), all
    11,172 precomposed modern-Korean syllables - not a trimmed "common
    syllables" list, and that is a deliberate rejection, not an oversight.

    Hangul is a featural, composed script: a syllable is (leading consonant,
    vowel, optional trailing consonant), and Unicode precomposes every
    grammatically valid combination into one codepoint per syllable rather
    than requiring runtime composition. There is no equivalent to jōyō's
    "characters legally permitted in personal names" tier here, because the
    analogous risk is different in kind: a jōyō-style frequency cut trims
    *kanji*, where a name using an uncommon character is the exception. A
    Hangul frequency cut trims *syllables*, and a real Korean given name is
    two or three syllable blocks chosen close to freely from the phonology -
    "common syllable" lists (built from corpus frequency, e.g. the ~2,350
    "KS X 1001-complete" syllables some legacy encodings shipped) reliably
    exclude syllables that are unremarkable in real names precisely because
    name syllables skew toward less-common combinations than everyday prose.
    For a form-signing app, a missing syllable in someone's own name is the
    worst-case failure this whole font effort exists to prevent, and it is a
    materially different failure than a Chinese form dropping to the generic
    refusal notice for an obscure character.

    The honest cost is size, not risk: full Hangul coverage is one dense,
    contiguous Unicode block (nothing to fetch or verify against a published
    list - the block itself, defined by the Unicode Standard and matching KS
    X 1001's completion, is the source), and the file-size tradeoff is
    reported in the build log and in TODO.md rather than hidden - see the
    per-family sizes recorded there. Given the alternative is a plausible,
    silent "your own name doesn't render" failure, that cost was accepted."""
    hangul = {chr(cp) for cp in range(HANGUL_SYLLABLES[0], HANGUL_SYLLABLES[1] + 1)}
    print(f"  hangul {len(hangul):,} precomposed syllables (U+AC00-D7A3, full block)")
    if len(hangul) != HANGUL_SYLLABLE_COUNT:
        sys.exit(f"Hangul syllable block gave {len(hangul)} codepoints, expected {HANGUL_SYLLABLE_COUNT}.")
    return hangul, COMMON_RANGES + KR_ONLY_RANGES, "Hangul Syllables block (full, U+AC00-D7A3) + Compatibility Jamo"


FAMILIES = {
    "jp": {
        "name": "NotoSansJP", "gf_dir": "notosansjp", "gf_file": "NotoSansJP",
        "chars_fn": jp_chars,
    },
    "sc": {
        "name": "NotoSansSC", "gf_dir": "notosanssc", "gf_file": "NotoSansSC",
        "chars_fn": sc_chars,
    },
    "tc": {
        "name": "NotoSansTC", "gf_dir": "notosanstc", "gf_file": "NotoSansTC",
        "chars_fn": tc_chars,
    },
    "kr": {
        "name": "NotoSansKR", "gf_dir": "notosanskr", "gf_file": "NotoSansKR",
        "chars_fn": kr_chars,
    },
}


def assert_glyf_aligned(font, path):
    """Fail loudly if any `loca` offset is odd - the defect described in point
    4 of the module docstring. Mirrors scripts/check-font-glyf-alignment.js,
    which enforces the same property over every bundled font at build time."""
    offsets = font["loca"].locations
    odd = sum(1 for o in offsets if o % 2)
    if odd:
        sys.exit(f"{path}: {odd} of {len(offsets)} loca offsets are odd - "
                 "fontkit's subsetter will emit blank glyphs from this font")


def build_family(key: str, spec: dict, work: Path, out: Path) -> None:
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
    from fontTools import subset

    name, gf_dir, gf_file = spec["name"], spec["gf_dir"], spec["gf_file"]
    var_url = f"https://raw.githubusercontent.com/google/fonts/main/ofl/{gf_dir}/{gf_file}%5Bwght%5D.ttf"
    license_url = f"https://raw.githubusercontent.com/google/fonts/main/ofl/{gf_dir}/OFL.txt"

    print(f"\n=== {name} ===")
    print("sources")
    var_path = fetch(var_url, work / f"{name}-var.ttf")
    fetch(license_url, work / f"{name}-OFL.txt")
    specific_chars, ranges, label = spec["chars_fn"](work)

    chars = set(specific_chars)
    for a, b in ranges:
        chars.update(chr(cp) for cp in range(a, b + 1))
    charfile = work / f"{name}-subset-chars.txt"
    charfile.write_text("".join(sorted(chars)), encoding="utf-8")
    print(f"  chars  {len(chars):,} requested ({label})")

    upstream = TTFont(var_path, lazy=True)
    upstream_cmap = set(upstream.getBestCmap())
    missing = sorted(c for c in chars if ord(c) not in upstream_cmap)
    if missing:
        sys.exit(f"upstream font lacks {len(missing)} requested characters: {''.join(missing)}")

    out.mkdir(parents=True, exist_ok=True)
    for style, wght in WEIGHTS.items():
        print(f"\n{name} {style} (wght={wght})")
        static = work / f"{name}-{style}-static.ttf"
        if not static.exists():
            f = TTFont(var_path)
            instancer.instantiateVariableFont(f, {"wght": wght}, inplace=True, updateFontNames=True)
            f.save(static)
        print(f"  static {static.stat().st_size:,} bytes")

        dest = out / f"{name}-{style}.ttf"
        subset.main([
            str(static),
            f"--text-file={charfile}",
            f"--output-file={dest}",
            f"--layout-features={LAYOUT_FEATURES}",
            f"--drop-tables+={DROP_TABLES}",
            "--no-hinting", "--desubroutinize",
            "--name-IDs=*", "--name-legacy", "--notdef-outline",
        ])

        # Point 4 in the module docstring: pyftsubset keeps the upstream's
        # alignment, and unaligned outlines subset into blank glyphs at export.
        t = TTFont(dest)
        t["glyf"].padding = 4
        t.save(dest)

        t = TTFont(dest)
        assert_glyf_aligned(t, dest)
        cmap = set(t.getBestCmap())
        gsub = sorted({r.FeatureTag for r in t["GSUB"].table.FeatureList.FeatureRecord}) if "GSUB" in t else []
        unexpected_gsub = sorted(set(gsub) - {"ccmp", "locl", "liga"})
        assert "GPOS" not in t, f"{name}: GPOS survived the subset - kerning would diverge from the browser"
        assert not unexpected_gsub, f"{name}: unexpected GSUB feature(s) survived the subset: {unexpected_gsub}"
        gaps = [c for c in chars if ord(c) not in cmap]
        assert not gaps, f"{name}: {len(gaps)} requested characters missing from the subset: {''.join(gaps[:40])}"
        hhea = t["hhea"]
        upem = t["head"].unitsPerEm
        print(f"  subset {dest.stat().st_size:,} bytes, {t['maxp'].numGlyphs:,} glyphs, "
              f"{len(cmap):,} codepoints, GSUB={gsub}, GPOS=absent")
        print(f"  metrics ascent {hhea.ascent / upem:.3f} descent {abs(hhea.descent) / upem:.3f} "
              f"(FONT_VERTICAL_METRICS values)")

    print(f"\nwrote {out}/{name}-Regular.ttf and {name}-Bold.ttf")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--work-dir", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--family", required=True, choices=[*FAMILIES.keys(), "all"],
                     help="jp's output is already committed - pass it explicitly to rebuild, "
                          "there is no default so a bare run cannot silently touch it.")
    args = ap.parse_args()
    work, out = args.work_dir, args.out
    work.mkdir(parents=True, exist_ok=True)

    keys = list(FAMILIES.keys()) if args.family == "all" else [args.family]
    for key in keys:
        build_family(key, FAMILIES[key], work, out)


if __name__ == "__main__":
    main()
