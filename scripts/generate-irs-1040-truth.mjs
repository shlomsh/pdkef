import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, PDFHexString, PDFString,
  decodePDFRawStream, decodeXfaXml,
} from '@cantoo/pdf-lib';

/**
 * Regenerates page 1 of IRS Form 1040 (tax year 2024) scoring ground truth
 * from the form itself.
 *
 * Like our practice form, this is a live AcroForm, so every widget's `/Rect`
 * IS the field, exact to the point, and no eyeballing pass is needed. Unlike
 * the practice form it is also a dense, real, public form - 88 answer
 * locations on one page - which is what makes it worth carrying: it is the
 * first scored form that is both Latin and crowded.
 *
 * Three things this has to decide that the practice form did not:
 *
 * **Radio or checkbox.** The printed page says "Check only one box" over
 * Filing Status and offers Digital Assets as a Yes/No pair, so both read as
 * mutually exclusive choices. The document does not implement them that way,
 * and this was measured rather than assumed: no field on the page carries the
 * Radio flag (`Ff` bit 16), no field has more than one kid widget, and the
 * XFA template - where an exclusive choice would be an `<exclGroup>` - has
 * zero of those and 74 `<checkButton>`s. The five Filing Status boxes are five
 * separate fields whose exclusivity is enforced by mouse-up scripts. So every
 * `/Btn` here is `checkbox`, and the rule below reports `radio` anyway if a
 * future revision of the form grows a real group. Kinds describe the form, and
 * this form's answer is checkbox.
 *
 * **Labels, from the form's own words.** The XFA field names (`f1_01[0]`) say
 * nothing to a reader, and CONTRACT.md's "never invented" applies to a label
 * as much as to a question. The form carries its own captions: each XFA field
 * holds an `<assist><speak>` string the IRS authored for screen readers, which
 * is the printed caption plus, on the first field of a block, that block's
 * heading. Those are copied verbatim, long ones included - trimming them would
 * be editing the form. A field with no caption gets no label.
 *
 * The eight dependents-table checkboxes carry a *second* `<speak>` left over
 * from an older revision ("Line 7c. Entry 1. ... (see page 9)", which is 2018
 * wording and matches nothing printed on this page), so the first one wins.
 * XFA allows one `<speak>` per `<assist>`; a second is residue, and reading it
 * would have labelled all eight with years-old text.
 *
 * **What is not an answer location.** Push buttons, hidden and no-view
 * widgets, read-only fields and zero-area rects are filtered out. On this
 * revision the filter removes nothing at all (every widget is `/F 4`, print
 * only, and no field is read-only or a push button), which is worth saying out
 * loud: the filter is here because the next form will need it, not because
 * this one did. The run prints what it dropped.
 *
 * Run: node scripts/generate-irs-1040-truth.mjs
 */
const FILE = 'src/editor/adapters/pdf/corpus/scoring/forms/irs-1040-2024.pdf';
const OUT = 'src/editor/adapters/pdf/corpus/scoring/ground-truth/irs-1040-2024-page1.json';
const PAGE_INDEX = 0;

/**
 * The render a human eyeballed the boxes against, produced with pdf.js's
 * legacy build and @napi-rs/canvas at a target width of 1241px (the width the
 * two Hebrew forms' renders use), which on a 612 x 792pt page comes out at
 * exactly 1241 x 1606.
 */
const RENDER = { file: 'irs-1040-2024-page1.png', width: 1241, height: 1606 };

/** Field flags (`/Ff`) and annotation flags (`/F`), by their 1-based spec bit. */
const READ_ONLY = 1 << 0;
const RADIO = 1 << 15;
const PUSH_BUTTON = 1 << 16;
const COMB = 1 << 24;
const HIDDEN = 1 << 1;
const NO_VIEW = 1 << 5;

const bytes = fs.readFileSync(FILE);
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const page = doc.getPage(PAGE_INDEX);
const { width: pw, height: ph } = page.getSize();
const ctx = doc.context;

const inherited = (w, key) => { let f = w, seen = new Set();
  while (f instanceof PDFDict && !seen.has(f)) { seen.add(f);
    const v = ctx.lookup(f.get(PDFName.of(key))); if (v !== undefined) return v;
    f = ctx.lookup(f.get(PDFName.of('Parent'))); } return undefined; };

const textOf = (obj) => obj?.decodeText?.() ?? obj?.asString?.();

/**
 * The widget's fully qualified field name, the way the XFA template names it:
 * every `/T` from the root down, joined with dots. Here that is
 * `topmostSubform[0].Page1[0].FilingStatus_ReadOrder[0].c1_3[0]`, and the
 * occurrence index is what tells the three Filing Status boxes under
 * `FilingStatus_ReadOrder` apart from the two sitting directly under `Page1`.
 */
const qualifiedName = (w) => {
  const parts = []; let f = w, seen = new Set();
  while (f instanceof PDFDict && !seen.has(f)) { seen.add(f);
    const t = textOf(ctx.lookup(f.get(PDFName.of('T'))));
    if (t !== undefined) parts.unshift(t);
    f = ctx.lookup(f.get(PDFName.of('Parent'))); }
  return parts.join('.');
};

/**
 * How many widgets the field this annotation belongs to has. One field with
 * several kid widgets is the shape of a radio group, so this is half of the
 * radio test; the other half is the Radio flag.
 */
const widgetsInField = (w) => {
  let f = w, seen = new Set();
  while (f instanceof PDFDict && !seen.has(f)) { seen.add(f);
    if (f.get(PDFName.of('T')) !== undefined) {
      const kids = ctx.lookup(f.get(PDFName.of('Kids')));
      return kids instanceof PDFArray ? kids.size() : 1;
    }
    f = ctx.lookup(f.get(PDFName.of('Parent'))); }
  return 1;
};

// ---------------------------------------------------------------------------
// The form's own captions, out of the XFA template packet.
// ---------------------------------------------------------------------------

/** The `template` packet's XML, through pdf-lib's public stream decoding. */
function xfaTemplateXml() {
  const acroForm = ctx.lookup(doc.catalog.get(PDFName.of('AcroForm')));
  const xfa = ctx.lookup(acroForm?.get(PDFName.of('XFA')));
  if (!(xfa instanceof PDFArray)) return null;
  for (let i = 0; i + 1 < xfa.size(); i += 2) {
    const name = ctx.lookup(xfa.get(i));
    const section = name instanceof PDFHexString || name instanceof PDFString ? textOf(name) : undefined;
    if (section !== 'template') continue;
    const stream = ctx.lookup(xfa.get(i + 1));
    if (stream instanceof PDFRawStream) return decodeXfaXml(decodePDFRawStream(stream).decode());
  }
  return null;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeEntities = (text) => text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body) => {
  if (body[0] === '#') return String.fromCodePoint(Number(body[1] === 'x' ? `0${body.slice(1)}` : body.slice(1)));
  return ENTITIES[body] ?? whole;
});

/**
 * Qualified field name -> the field's `<assist><speak>` caption.
 *
 * A tag scan rather than an XML parse, because the only XML parsers on hand
 * are jsdom's transitive dependencies and a script has no business reaching
 * for those. It tracks the containers XFA names (`subform`, `field`, `area`,
 * `exclGroup`), numbering each by its occurrence within its parent exactly as
 * the qualified name above does, so the two sides meet on the same string.
 */
function captionsByFieldName(xml) {
  const captions = new Map();
  if (!xml) return captions;
  const NAMED = new Set(['subform', 'field', 'area', 'exclGroup']);
  const TAG = /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<(\/?)([A-Za-z][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  const stack = [{ segment: null, counts: new Map(), isField: false }];
  let speakFrom = null;
  let match;
  while ((match = TAG.exec(xml)) !== null) {
    const [whole, closing, rawTag, attrs, selfClosing] = match;
    if (rawTag === undefined) continue; // a processing instruction or a comment
    const tag = rawTag.toLowerCase();
    const top = stack[stack.length - 1];

    if (tag === 'speak' && top.isField) {
      if (closing) {
        const path = stack.filter((f) => f.segment).map((f) => f.segment).join('.');
        // First caption wins: see the stale second `<speak>` noted above.
        if (speakFrom !== null && !captions.has(path)) {
          captions.set(path, decodeEntities(xml.slice(speakFrom, match.index)).trim());
        }
        speakFrom = null;
      } else if (!selfClosing) speakFrom = match.index + whole.length;
      continue;
    }
    if (!NAMED.has(tag)) continue;
    if (closing) { if (stack.length > 1) stack.pop(); continue; }
    if (selfClosing) continue;

    const name = attrs.match(/\sname="([^"]*)"/)?.[1];
    let segment = null;
    if (name !== undefined) {
      const index = top.counts.get(name) ?? 0;
      top.counts.set(name, index + 1);
      segment = `${decodeEntities(name)}[${index}]`;
    }
    stack.push({ segment, counts: new Map(), isField: tag === 'field' });
  }
  return captions;
}

const captions = captionsByFieldName(xfaTemplateXml());

// ---------------------------------------------------------------------------
// Widgets -> targets.
// ---------------------------------------------------------------------------

/**
 * Kinds describe the FORM. `/Btn` is a radio only where the document really
 * groups the choices - the Radio flag, or one field wearing several widgets -
 * and this form does neither, so its five "check only one box" filing statuses
 * are five checkboxes, which is what it built them as.
 */
const kindOf = (ft, ff, maxLen, widgets) => {
  if (ft === '/Btn') return (ff & RADIO) || widgets > 1 ? 'radio' : 'checkbox';
  if ((ff & COMB) && maxLen > 1) return 'comb';
  return 'text';
};

/** Why this widget is not an answer location, or null if it is one. */
const excuse = (ft, ff, f, rect) => {
  if (ft === '/Btn' && (ff & PUSH_BUTTON)) return 'push button';
  if (ff & READ_ONLY) return 'read-only field';
  if (f & HIDDEN) return 'hidden widget';
  if (f & NO_VIEW) return 'no-view widget';
  if (!rect || rect.width <= 0 || rect.height <= 0) return 'zero-area rect';
  return null;
};

/**
 * The three blanks in "For the year Jan. 1-Dec. 31, 2024, or other tax year
 * beginning ____, 2024, ending ____, 20__" are the page's only candidates for
 * a `date` kind, and they are left as `text` on purpose. Each holds one
 * fragment of a printed phrase - a month and day, or two digits of a year -
 * rather than a date the form asks for whole, so calling them dates would
 * assert a format the form does not. Flagged here so a reviewer can disagree
 * with the call instead of having to find it.
 */
const FISCAL_YEAR_FIELDS = new Set(['f1_01[0]', 'f1_02[0]', 'f1_03[0]']);
const FISCAL_YEAR_NOTE = 'left as text, not date: one fragment of the printed fiscal-year phrase '
  + '(a month and day, or two digits of a year), not a whole date the form asks for';

const annots = page.node.Annots();
const targets = [];
const excluded = [];
for (let i = 0; i < annots.size(); i += 1) {
  const w = ctx.lookup(annots.get(i));
  const name = qualifiedName(w);
  const ft = inherited(w, 'FT')?.asString?.();
  const ff = inherited(w, 'Ff')?.asNumber?.() ?? 0;
  const maxLen = inherited(w, 'MaxLen')?.asNumber?.();
  const f = ctx.lookup(w.get(PDFName.of('F')))?.asNumber?.() ?? 0;
  const rect = ctx.lookup(w.get(PDFName.of('Rect')))?.asRectangle?.();

  const why = excuse(ft, ff, f, rect);
  if (why) { excluded.push(`${name} (${why})`); continue; }

  const target = {
    id: `t${String(targets.length + 1).padStart(3, '0')}`,
    kind: kindOf(ft, ff, maxLen, widgetsInField(w)),
    // CONTRACT.md: x = x0/pageWidth, y = (pageHeight - yTop)/pageHeight.
    bounds: {
      x: +(rect.x / pw).toFixed(4),
      y: +((ph - (rect.y + rect.height)) / ph).toFixed(4),
      width: +(rect.width / pw).toFixed(4),
      height: +(rect.height / ph).toFixed(4),
    },
  };
  const caption = captions.get(name);
  if (caption) target.label = caption;
  if (target.kind === 'comb') target.cells = maxLen;
  if (FISCAL_YEAR_FIELDS.has(name.split('.').pop())) target.notes = FISCAL_YEAR_NOTE;
  targets.push(target);
}

const truth = {
  form: 'irs-1040-2024',
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  sourceUrl: 'https://www.irs.gov/pub/irs-prior/f1040--2024.pdf',
  pageIndex: PAGE_INDEX,
  pageSize: { width: pw, height: ph },
  render: RENDER,
  notes: 'IRS Form 1040, tax year 2024, page 1. A live AcroForm, so every target is one of the page\'s '
    + 'own widgets and the bounds are exact rather than annotated. Labels are the form\'s own XFA '
    + '<assist><speak> captions, verbatim: the IRS wrote them for screen readers, so the first field of '
    + 'a block carries that block\'s heading as well as its own caption, and a few run long. Every /Btn '
    + 'on this page is a checkbox, including the five "check only one box" filing statuses and the '
    + 'Digital Assets Yes/No pair - measured, not assumed: no Radio flag, no multi-widget field, no XFA '
    + '<exclGroup>. Public domain (17 U.S.C. 105). Generated by scripts/generate-irs-1040-truth.mjs; '
    + 'regenerate rather than hand-edit.',
  targets,
};
fs.writeFileSync(OUT, JSON.stringify(truth, null, 1) + '\n');

const counts = targets.reduce((acc, t) => ({ ...acc, [t.kind]: (acc[t.kind] ?? 0) + 1 }), {});
console.log(`page ${pw}x${ph}, ${targets.length} targets: `
  + Object.entries(counts).map(([kind, n]) => `${n} ${kind}`).join(', '));
console.log(`labels: ${targets.filter((t) => t.label).length} of ${targets.length} from the form's own captions`);
console.log(excluded.length === 0
  ? 'excluded: nothing - no push button, hidden, no-view, read-only or zero-area widget on this page'
  : `excluded ${excluded.length}: ${excluded.join(', ')}`);
