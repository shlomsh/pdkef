/**
 * Dotted-leader fields: a printed label followed by a run of dots ("ชื่อ...............") that a
 * person writes over (FORM-19).
 *
 * Thai forms mark most answers this way rather than with a ruled box. The dots are text, not ink,
 * so `formCells.js` has nothing to close and `formLines.js` has no rule to find; the only evidence
 * is the text layer. pdf.js hands a label and its dots back as one run ("ชื่อสถานประกอบการ......"),
 * sometimes with several labels and leaders in one run ("รหัสไปรษณีย์....โทรศัพท์....").
 *
 * ## The rule (precision over reach - SNG-11)
 *
 * 1. A **leader** is `MIN_DOTS` or more consecutive dots, or underscores (Word typesets a blank as
 *    `_____`). Where it stands is read off the run: the dots are one fixed advance wide (calibrated
 *    from the page's own pure-dot runs, so each font size gets its own), the rest of the run's width
 *    is shared among its other characters. A right-to-left run (`dir: 'rtl'`) is laid out from its
 *    right end, so what comes last in its string stands leftmost.
 * 2. Its **label** comes from the side its script captions from (right for Hebrew and Arabic, left
 *    otherwise): the text beside it in its own run, else the nearest run on that side; then the same
 *    on the other side; then a caption printed just under it. Edge punctuation is stripped. Its
 *    **kind** comes from the label: a signature word, a date word, else text.
 * 3. A leader followed by nothing but a number is a table-of-contents entry, not a field
 *    ("Introduction ........ 12"). A unit or word after it ("จำนวน.....แผ่น") is not a number.
 * 4. A line that is only dots and sits directly under another leader, aligned with its dots or with
 *    the label printed before them, is that field's next line, and extends it down instead of
 *    being a field of its own. A dots-only run that starts where a leader on the same line ends is
 *    the same leader carried over into the next text run, and extends it sideways.
 * 5. A field too short to write in (`MIN_WIDTH`), once its runs are joined, is ignored.
 *
 * Like `formLines.js`, it never re-reports ground another detector already published
 * (`existingRegions`), and its confidence sits below a closed cell's: a run of printed dots is
 * weaker evidence than a drawn box.
 *
 * Everything here is page percent, the unit the text runs and the published candidates share, so
 * there is no geometry transform to get wrong.
 */

/** Fewer dots than this is an ellipsis, not a leader. */
const MIN_DOTS = 5;
/** A leader narrower than this share of the page's width is too short to write in. */
const MIN_WIDTH = 3;
/** Dots are `.` and the ellipsis/leader characters some producers use instead; underscores are a blank too. */
const DOT = '[.\\u2026\\u2024\\u00B7_\\u2017\\uFF3F]';
/** An underscore sits as wide as ~0.55 of its height, a dot ~0.3: the two calibrate apart. */
const UNDERSCORE_RE = /[_\u2017\uFF3F]/;
const LEADER_RE = new RegExp(`${DOT}{${MIN_DOTS},}`, 'g');
const RTL_LETTERS_RE = /[\u0590-\u05FF\u0600-\u06FF]/;
const WORD_CHAR_RE = /[\p{L}\p{N}]/u;
/** One decision for position and caption side: pdf.js's direction, else the run's own letters. */
const isRtl = (run) => (run.dir ? run.dir === 'rtl' : RTL_LETTERS_RE.test(run.str));
/** Underscores glued to letters or digits on both ends are an identifier or a URL, not a blank. */
const insideWord = (str, match) => UNDERSCORE_RE.test(match[0][0])
  && WORD_CHAR_RE.test(str[match.index - 1] ?? '') && WORD_CHAR_RE.test(str[match.index + match[0].length] ?? '');
const PURE_DOTS_RE = new RegExp(`^\\s*${DOT}+\\s*$`);
/** What may follow a leader in a table-of-contents entry: a page number, Latin, Thai or Arabic. */
const PAGE_NUMBER_RE = /^[\s\d๐-๙٠-٩ivxlcdmIVXLCDM]{1,6}$/;
/** A label longer than this is a sentence, not a name for the blank after it. */
const MAX_LABEL_CHARS = 40;
/** A run on the same line when its top is within this share of the line's height. */
const SAME_LINE = 0.5;
/** How far left of a leader a label run may end, as a share of page width, to still name it. */
const LABEL_GAP_MAX = 4;
/** A dots-only line extends the field above when it starts within this share of page width of it. */
const CONTINUATION_ALIGN = 1.5;
/** A dots-only run on the same line carries a leader over when it starts within this much of its end. */
const ABUT_GAP = 1.5;
/** ...and sits no further below than this many of its own line heights. */
const CONTINUATION_LINES = 1.6;

/** Signature and date words by script; matched as substrings of the label, as `formCells.js` does. */
const SIGNATURE_WORDS = ['ลงชื่อ', 'ลายมือชื่อ', 'signature', 'sign'];
const DATE_WORDS = ['วันที่', 'เดือน', 'พ.ศ', 'ปี', 'date', 'dated'];

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** `signature`, `date` or `text`, from the label alone. */
export function leaderKind(label) {
  const text = (label || '').toLowerCase();
  if (SIGNATURE_WORDS.some((word) => text.includes(word))) return 'signature';
  if (DATE_WORDS.some((word) => text.includes(word))) return 'date';
  return 'text';
}

/**
 * The page's dot advance per font size: median of width / dots over its pure-dot runs, keyed by
 * the run's height (rounded to a tenth), dots and underscores apart. A run with no pure-dot sibling
 * of its own height falls back to the nearest one, then to a share of its own height.
 */
function dotAdvances(runs) {
  const byHeight = new Map();
  for (const run of runs) {
    if (!PURE_DOTS_RE.test(run.str)) continue;
    const dots = [...run.str].filter((ch) => new RegExp(DOT).test(ch)).length;
    if (dots < MIN_DOTS) continue;
    const key = `${UNDERSCORE_RE.test(run.str) ? 'u' : 'd'}${run.height.toFixed(1)}`;
    byHeight.set(key, [...(byHeight.get(key) ?? []), run.width / dots]);
  }
  const table = [...byHeight.entries()].map(([key, values]) => [key[0], Number(key.slice(1)), median(values)]);
  return (run) => {
    const kind = UNDERSCORE_RE.test(run.str) ? 'u' : 'd';
    const own = table.filter((entry) => entry[0] === kind);
    if (own.length === 0) return run.height * (kind === 'u' ? 0.55 : 0.3);
    return own.reduce((best, entry) => (
      Math.abs(entry[1] - run.height) < Math.abs(best[1] - run.height) ? entry : best
    ))[2];
  };
}

/**
 * Where each leader in one run stands, in page percent, with the text printed just before it.
 *
 * Characters other than dots share what the dots leave of the run's width equally - a Thai label's
 * glyphs vary, but its position inside a leader-sized run only has to land within a field's width.
 *
 * @returns {Array<{left: number, width: number, before: string, after: string}>}
 */
function leadersInRun(run, advance) {
  const chars = [...run.str];
  const rtl = isRtl(run);
  const matches = [...run.str.matchAll(LEADER_RE)].filter((match) => !insideWord(run.str, match));
  if (matches.length === 0) return [];
  const dotCount = matches.reduce((sum, match) => sum + [...match[0]].length, 0);
  const otherCount = chars.length - dotCount;
  const dotsWidth = Math.min(run.width, dotCount * advance);
  const otherWidth = Math.max(0, run.width - dotsWidth);
  const each = otherCount > 0 ? otherWidth / otherCount : 0;

  return matches.map((match, index) => {
    const start = [...run.str.slice(0, match.index)].length;
    const length = [...match[0]].length;
    const dotsBefore = matches.slice(0, index).reduce((sum, m) => sum + [...m[0]].length, 0);
    const othersBefore = start - dotsBefore;
    const previousEnd = index === 0 ? 0 : matches[index - 1].index + matches[index - 1][0].length;
    const nextStart = index + 1 < matches.length ? matches[index + 1].index : run.str.length;
    return {
      left: run.left + (rtl
        ? (dotCount - dotsBefore - length) * advance + (otherCount - othersBefore) * each
        : dotsBefore * advance + othersBefore * each),
      width: length * advance,
      before: run.str.slice(previousEnd, match.index).replace(/\s+/g, ' ').trim(),
      after: run.str.slice(match.index + match[0].length, nextStart).trim(),
    };
  });
}

const sameLine = (a, b) => Math.abs(a.top - b.top) <= SAME_LINE * Math.max(a.height, b.height);

/** Punctuation and space a label does not keep at its ends. */
const LABEL_EDGE_RE = /^[\s.:?,;_\u2017\uFF3F]+|[\s.:?,;_\u2017\uFF3F]+$/g;
/** A caption printed under a blank sits no further below it than this many of the blank's line heights. */
const CAPTION_BELOW_LINES = 1.5;

// Two or more in a row is leader residue; a single dot is an abbreviation's (ת.ז, พ.ศ) and stays.
const cleanLabel = (text) => text.replace(new RegExp(`${DOT}{2,}`, 'g'), ' ').replace(/\s+/g, ' ').replace(LABEL_EDGE_RE, '');

/** The text of the nearest same-line run on one side of `leader`, when it ends close enough to name it. */
function labelFromSide(leader, runs, side) {
  const right = leader.left + leader.width;
  const gap = (run) => (side === 'left' ? leader.left - (run.left + run.width) : run.left - right);
  const nearest = runs
    .filter((run) => run !== leader.run && sameLine(run, leader.run) && gap(run) >= -0.5 && gap(run) <= LABEL_GAP_MAX)
    .sort((a, b) => gap(a) - gap(b))[0];
  return nearest ? cleanLabel(nearest.str) : '';
}

/** The run just below the blank whose centre falls inside its span: a caption printed under the line. */
function labelFromBelow(leader, runs) {
  const below = runs
    .filter((run) => {
      const centre = run.left + run.width / 2;
      return run.top > leader.top && run.top - (leader.top + leader.height) <= CAPTION_BELOW_LINES * leader.height
        && centre >= leader.left && centre <= leader.left + leader.width;
    })
    .sort((a, b) => a.top - b.top)[0];
  return below ? cleanLabel(below.str) : '';
}

/**
 * What names a leader, by visual side with the caption side first: the text in its own run on that
 * side, the nearest run on that side, then the same two on the other side (own text only when short),
 * then a caption printed under it. The caption sits on the right for Hebrew and Arabic text, else on
 * the left, decided by the run's direction (pdf.js `dir`, else its letters). In a right-to-left run the string's `before` stands to the right of the blank.
 */
function labelFor(leader, runs) {
  const rtlRun = isRtl(leader.run);
  const captionSide = rtlRun ? 'right' : 'left';
  const inRun = rtlRun ? { right: leader.before, left: leader.after } : { left: leader.before, right: leader.after };
  const sides = captionSide === 'right' ? ['right', 'left'] : ['left', 'right'];
  for (const side of sides) {
    const own = cleanLabel(inRun[side]);
    if (own && (side === captionSide || own.length <= MAX_LABEL_CHARS)) return own;
    const label = labelFromSide(leader, runs, side);
    if (label) return label;
  }
  return labelFromBelow(leader, runs);
}

/** True when the leader runs on into nothing but a page number: a table-of-contents entry. */
function isTocEntry(leader, runs) {
  if (leader.after) return PAGE_NUMBER_RE.test(leader.after);
  const right = runs
    .filter((run) => run !== leader.run && sameLine(run, leader.run) && run.left >= leader.left + leader.width - 0.5)
    .sort((a, b) => a.left - b.left)[0];
  return Boolean(right) && PAGE_NUMBER_RE.test(right.str);
}

/** Page-percent rectangle overlap - did something else already publish here. */
function boundsOverlap(a, b) {
  return a.left < b.left + b.width && a.left + a.width > b.left
    && a.top < b.top + b.height && a.top + a.height > b.top;
}

/**
 * @typedef {import('./fieldTypes.ts').PercentBox} PercentBox
 * @typedef {import('./fieldTypes.ts').PageTextRun} PageTextRun
 */

/**
 * Dotted-leader field candidates on one page.
 *
 * @param {number} pageIndex
 * @param {PageTextRun[]} textItems page text, page-percent bounds
 * @param {PercentBox[]} [existingRegions] bounds another detector already published on this page
 */
export function detectLeaderCandidates(pageIndex, textItems, existingRegions = []) {
  const runs = textItems.filter((run) => run.str && run.str.trim());
  const advance = dotAdvances(runs);

  const leaders = [];
  for (const run of runs) {
    for (const found of leadersInRun(run, advance(run))) {
      leaders.push({ ...found, run, top: run.top, height: run.height, pure: PURE_DOTS_RE.test(run.str) });
    }
  }

  const fields = [];
  for (const leader of leaders) {
    if (isTocEntry(leader, runs)) continue;
    const label = labelFor(leader, runs);
    if (label.length > MAX_LABEL_CHARS) continue;

    // The same leader carried into the next text run: it starts its run, where the last one ended.
    const carried = !leader.before && fields.find((field) => sameLine(field, leader)
      && leader.left >= field.left + field.width - 0.5 && leader.left - (field.left + field.width) <= ABUT_GAP);
    if (carried) {
      carried.width = leader.left + leader.width - carried.left;
      continue;
    }
    if (leader.pure && !leader.before) {
      // A dots-only line under a field, aligned with its dots or its label, is its next line.
      const above = fields.find((field) => (Math.abs(field.left - leader.left) <= CONTINUATION_ALIGN
          || Math.abs(field.run.left - leader.left) <= CONTINUATION_ALIGN)
        && leader.top > field.top
        && leader.top - (field.top + field.height) <= CONTINUATION_LINES * leader.height);
      if (above) {
        const right = Math.max(above.left + above.width, leader.left + leader.width);
        above.left = Math.min(above.left, leader.left);
        above.width = right - above.left;
        above.height = leader.top + leader.height - above.top;
        continue;
      }
    }
    fields.push({
      left: leader.left, top: leader.top, width: leader.width, height: leader.height, label, run: leader.run,
    });
  }

  // Judged on the merged field: a leader carried over into a 1pt run is still a whole field.
  return fields
    .filter((field) => field.width >= MIN_WIDTH)
    .filter((field) => !existingRegions.some((region) => boundsOverlap(field, region)))
    .map((field, index) => ({
      id: `form-leaders-${String(index).padStart(4, '0')}`,
      pageIndex,
      left: field.left,
      top: field.top,
      width: field.width,
      height: field.height,
      kind: leaderKind(field.label),
      label: field.label || undefined,
      required: 'unknown',
      // Below a closed cell's ceiling (0.7) and `formLines.js`'s 0.55: printed dots are the weakest
      // of the three kinds of evidence, since a dotted rule is not always a blank.
      confidence: 0.5,
      source: 'form-leaders',
      notes: 'dotted leader',
    }));
}
