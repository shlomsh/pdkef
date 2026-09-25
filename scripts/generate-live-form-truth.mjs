import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, PDFHexString, PDFString,
  decodePDFRawStream, decodeXfaXml,
} from '@cantoo/pdf-lib';

/**
 * Ground truth for every live-AcroForm scored form, from one generator.
 *
 * `generate-practice-form-truth.mjs` and `generate-irs-1040-truth.mjs` used to be two
 * near-identical widget walkers (inherited-attribute lookup, bounds-from-rect, comb/checkbox kind
 * mapping) that differed only in where each form's label comes from and which widgets it
 * excludes. FORM-16 added two Thai forms with a third label source (a `/TU` tooltip, no XFA),
 * which made a third copy the wrong move. This file is the one widget walker; each entry in
 * `FORMS` below supplies only what actually differs per form - its label source, its kind rule,
 * its exclusion rule and its own prose notes. The `irs-1040` entry's output is unchanged from the
 * original `generate-irs-1040-truth.mjs` (verified by regenerating and diffing against git
 * history). The practice form no longer has an entry here at all: SNG-10 replaced it with a flat
 * vector form with no `/AcroForm`, so its ground truth can no longer come from widgets - it is
 * generated straight from its own layout instead, by `scripts/generate-practice-form.mjs`.
 *
 * A live AcroForm needs no eyeballing pass: every widget's `/Rect` IS the field, exact to the
 * point, so the ground truth is exact rather than annotated. What differs form to form is only
 * where an honest label comes from, and "don't invent" (`README.md`, `CONTRACT.md`) means every
 * form here gets its labels from the form's OWN words - a field name, an XFA `<assist><speak>`,
 * or a `/TU` tooltip - never a guess at what a widget is for.
 *
 * Run: node scripts/generate-live-form-truth.mjs <form-key>
 *  or: node scripts/generate-live-form-truth.mjs --all
 */

// ---------------------------------------------------------------------------
// Shared widget-walking core.
// ---------------------------------------------------------------------------

/** Field flags (`/Ff`) and annotation flags (`/F`), by their 1-based spec bit. */
export const READ_ONLY = 1 << 0;
export const HIDDEN = 1 << 1;
export const NO_VIEW = 1 << 5;
export const RADIO = 1 << 15;
export const PUSH_BUTTON = 1 << 16;
export const COMB = 1 << 24;

export const textOf = (obj) => obj?.decodeText?.() ?? obj?.asString?.();

/** Walks `/Parent` for the nearest defined value of an inheritable field attribute. */
export const inherited = (ctx, w, key) => {
  let f = w; const seen = new Set();
  while (f instanceof PDFDict && !seen.has(f)) {
    seen.add(f);
    const v = ctx.lookup(f.get(PDFName.of(key)));
    if (v !== undefined) return v;
    f = ctx.lookup(f.get(PDFName.of('Parent')));
  }
  return undefined;
};

/**
 * The widget's fully qualified field name, every `/T` from the root down, dot-joined - the way
 * an XFA template names it (`topmostSubform[0].Page1[0]....`).
 */
export const qualifiedName = (ctx, w) => {
  const parts = []; let f = w; const seen = new Set();
  while (f instanceof PDFDict && !seen.has(f)) {
    seen.add(f);
    const t = textOf(ctx.lookup(f.get(PDFName.of('T'))));
    if (t !== undefined) parts.unshift(t);
    f = ctx.lookup(f.get(PDFName.of('Parent')));
  }
  return parts.join('.');
};

/**
 * How many widgets the field this annotation belongs to has. One field with several kid widgets
 * is the shape of a radio group, so this is half of the radio test; the other half is the Radio
 * flag itself.
 */
export const widgetsInField = (ctx, w) => {
  let f = w; const seen = new Set();
  while (f instanceof PDFDict && !seen.has(f)) {
    seen.add(f);
    if (f.get(PDFName.of('T')) !== undefined) {
      const kids = ctx.lookup(f.get(PDFName.of('Kids')));
      return kids instanceof PDFArray ? kids.size() : 1;
    }
    f = ctx.lookup(f.get(PDFName.of('Parent')));
  }
  return 1;
};

/**
 * Kinds describe the FORM, not the detector. A `/Btn` is a radio only where the document really
 * groups the choices - the Radio flag, or one field wearing several widgets - never assumed from
 * what the printed page says ("check only one box" reads the same whether or not the PDF
 * implements it that way).
 */
export const defaultKindOf = ({ ft, ff, maxLen, widgets }) => {
  if (ft === '/Btn') return (ff & RADIO) || widgets > 1 ? 'radio' : 'checkbox';
  if ((ff & COMB) && maxLen > 1) return 'comb';
  return 'text';
};

/** Why this widget is not an answer location, or null if it is one. */
export const defaultExcuse = ({ ft, ff, f, rect }) => {
  if (ft === '/Btn' && (ff & PUSH_BUTTON)) return 'push button';
  if (ff & READ_ONLY) return 'read-only field';
  if (f & HIDDEN) return 'hidden widget';
  if (f & NO_VIEW) return 'no-view widget';
  if (!rect || rect.width <= 0 || rect.height <= 0) return 'zero-area rect';
  return null;
};

/**
 * Walks one page's `/Annots`, turning each widget into a target (or an exclusion). Every hook
 * (`kindOf`, `excuse`, `labelFor`, `targetExtra`) receives the same context object - `ctx`, `w`
 * (the widget dict), its index `i` in `/Annots`, the inherited `ft`/`ff`/`maxLen`, the widget's
 * own `f` (annotation flags) and `rect`, and `widgets` (kid count of its field) - so a form whose
 * kind or label depends on the field's own name, an XFA caption or a tooltip can read whatever it
 * needs. `kindOf`/`excuse` default to the rules above; a form overrides one when its own widgets
 * disagree (the practice form's checkboxes carry no Radio flag to test, and its own annots need
 * no exclusion pass at all). `labelFor` returns a label string or nothing - "don't invent" means
 * no label is exactly as valid an answer as one is.
 */
export function collectWidgetTargets({
  doc, pageIndex, kindOf = defaultKindOf, excuse = defaultExcuse, labelFor, targetExtra,
}) {
  const ctx = doc.context;
  const page = doc.getPage(pageIndex);
  const { width: pw, height: ph } = page.getSize();
  const annots = page.node.Annots();
  const targets = [];
  const excluded = [];
  for (let i = 0; i < annots.size(); i += 1) {
    const w = ctx.lookup(annots.get(i));
    const ft = inherited(ctx, w, 'FT')?.asString?.();
    const ff = inherited(ctx, w, 'Ff')?.asNumber?.() ?? 0;
    const maxLen = inherited(ctx, w, 'MaxLen')?.asNumber?.();
    const f = ctx.lookup(w.get(PDFName.of('F')))?.asNumber?.() ?? 0;
    const rect = ctx.lookup(w.get(PDFName.of('Rect')))?.asRectangle?.();
    const widget = { ctx, w, i, ft, ff, maxLen, f, rect, widgets: widgetsInField(ctx, w) };

    const why = excuse ? excuse(widget) : null;
    if (why) { excluded.push({ ...widget, why }); continue; }

    const kind = kindOf(widget);
    const target = {
      id: `t${String(targets.length + 1).padStart(3, '0')}`,
      kind,
      // CONTRACT.md: x = x0/pageWidth, y = (pageHeight - yTop)/pageHeight.
      bounds: {
        x: +(rect.x / pw).toFixed(4),
        y: +((ph - (rect.y + rect.height)) / ph).toFixed(4),
        width: +(rect.width / pw).toFixed(4),
        height: +(rect.height / ph).toFixed(4),
      },
    };
    const label = labelFor ? labelFor(widget) : undefined;
    if (label) target.label = label;
    if (targetExtra) targetExtra(target, widget);
    if (kind === 'comb') target.cells = maxLen;
    targets.push(target);
  }
  return { targets, excluded, pageWidth: pw, pageHeight: ph };
}

/** The `template` packet's XML out of a form's `/AcroForm /XFA`, through pdf-lib's public stream decoding. */
export function xfaTemplateXml(doc) {
  const ctx = doc.context;
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

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeXmlEntities = (text) => text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body) => {
  if (body[0] === '#') return String.fromCodePoint(Number(body[1] === 'x' ? `0${body.slice(1)}` : body.slice(1)));
  return XML_ENTITIES[body] ?? whole;
});

/**
 * Qualified field name -> the field's `<assist><speak>` caption, out of an XFA template packet.
 *
 * A tag scan rather than an XML parse, because the only XML parsers on hand are jsdom's
 * transitive dependencies and a script has no business reaching for those. It tracks the
 * containers XFA names (`subform`, `field`, `area`, `exclGroup`), numbering each by its
 * occurrence within its parent exactly as `qualifiedName` above does, so the two sides meet on
 * the same string.
 */
export function xfaCaptionsByFieldName(xml) {
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
        // First caption wins: a stale second `<speak>` is residue from an older revision.
        if (speakFrom !== null && !captions.has(path)) {
          captions.set(path, decodeXmlEntities(xml.slice(speakFrom, match.index)).trim());
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
      segment = `${decodeXmlEntities(name)}[${index}]`;
    }
    stack.push({ segment, counts: new Map(), isField: tag === 'field' });
  }
  return captions;
}

/** Writes the truth file in the shape every scored form shares, and reports what it found. */
function writeTruth({ out, form, bytes, sourceUrl, pageIndex, pageWidth, pageHeight, render, notes, targets }) {
  const truth = {
    form,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    sourceUrl,
    pageIndex,
    pageSize: { width: pageWidth, height: pageHeight },
    render,
    notes,
    targets,
  };
  fs.writeFileSync(out, `${JSON.stringify(truth, null, 1)}\n`);

  const counts = targets.reduce((acc, t) => ({ ...acc, [t.kind]: (acc[t.kind] ?? 0) + 1 }), {});
  console.log(`  page ${pageWidth}x${pageHeight}, ${targets.length} targets: `
    + Object.entries(counts).map(([kind, n]) => `${n} ${kind}`).join(', '));
  console.log(`  labels: ${targets.filter((t) => t.label).length} of ${targets.length}`);
}

/** Runs one form's generator entry end to end. */
async function generateOne(key, spec) {
  console.log(`\n=== ${key} ===`);
  const bytes = fs.readFileSync(spec.file);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const { targets, excluded, pageWidth, pageHeight } = collectWidgetTargets({
    doc,
    pageIndex: spec.pageIndex,
    kindOf: spec.kindOf,
    excuse: spec.excuse,
    labelFor: spec.labelFor,
    targetExtra: spec.targetExtra,
  });
  console.log(excluded.length === 0
    ? '  excluded: nothing'
    : `  excluded ${excluded.length}: ${excluded.map((e) => `${qualifiedName(e.ctx, e.w)} (${e.why})`).join(', ')}`);
  writeTruth({
    out: spec.out,
    form: spec.form ?? key,
    bytes,
    sourceUrl: spec.sourceUrl,
    pageIndex: spec.pageIndex,
    pageWidth,
    pageHeight,
    render: spec.render ?? null,
    notes: spec.notes,
    targets,
  });
}

// ---------------------------------------------------------------------------
// Per-form configuration. Each entry supplies only what differs.
// ---------------------------------------------------------------------------

/**
 * IRS Form 1040. Reproduces `generate-irs-1040-truth.mjs`'s original output exactly: default
 * exclusion and kind rules, labels from the form's own XFA `<assist><speak>` captions, and the
 * fiscal-year note on the three date fragments that are not date targets.
 */
const FISCAL_YEAR_FIELDS = new Set(['f1_01[0]', 'f1_02[0]', 'f1_03[0]']);
const FISCAL_YEAR_NOTE = 'left as text, not date: one fragment of the printed fiscal-year phrase '
  + '(a month and day, or two digits of a year), not a whole date the form asks for';

const irs1040 = {
  form: 'irs-1040-2024',
  file: 'src/tools/sign/fields/corpus/scoring/forms/irs-1040-2024.pdf',
  out: 'src/tools/sign/fields/corpus/scoring/ground-truth/irs-1040-2024-page1.json',
  sourceUrl: 'https://www.irs.gov/pub/irs-prior/f1040--2024.pdf',
  pageIndex: 0,
  render: { file: 'irs-1040-2024-page1.png', width: 1241, height: 1606 },
  labelFor: null, // set below once the document is loaded, since captions need the XFA packet
  targetExtra: (target, { ctx, w }) => {
    if (FISCAL_YEAR_FIELDS.has(qualifiedName(ctx, w).split('.').pop())) target.notes = FISCAL_YEAR_NOTE;
  },
  notes: 'IRS Form 1040, tax year 2024, page 1. A live AcroForm, so every target is one of the page\'s '
    + 'own widgets and the bounds are exact rather than annotated. Labels are the form\'s own XFA '
    + '<assist><speak> captions, verbatim: the IRS wrote them for screen readers, so the first field of '
    + 'a block carries that block\'s heading as well as its own caption, and a few run long. Every /Btn '
    + 'on this page is a checkbox, including the five "check only one box" filing statuses and the '
    + 'Digital Assets Yes/No pair - measured, not assumed: no Radio flag, no multi-widget field, no XFA '
    + '<exclGroup>. Public domain (17 U.S.C. 105). Generated by scripts/generate-live-form-truth.mjs; '
    + 'regenerate rather than hand-edit.',
};

/**
 * Thai forms carry no XFA packet, so their labels come from `/TU` - the field's inheritable
 * tooltip/alternate-description string - when the form set one. `/TU` never differs between a
 * widget and its own field's `/TU` here (checked directly), so the inherited lookup covers both.
 * A field with no `/TU` gets no label rather than one built from its auto-generated name
 * (`Text312`, `Radio Button218`): those names come from the authoring tool, not the form.
 */
const thaiLabelFor = ({ ctx, w }) => textOf(inherited(ctx, w, 'TU'))?.trim() || undefined;

const thaiPnd90 = {
  form: 'thai-pnd90-2565',
  file: 'src/tools/sign/fields/corpus/scoring/forms/thai-pnd90-2565.pdf',
  out: 'src/tools/sign/fields/corpus/scoring/ground-truth/thai-pnd90-2565-page3.json',
  sourceUrl: 'https://www.rd.go.th/fileadmin/tax_pdf/pit/2565/271265PIT90.pdf',
  pageIndex: 2,
  render: { file: 'thai-pnd90-2565-page3.png', width: 1241, height: 1755 },
  labelFor: thaiLabelFor,
  notes: 'Revenue Department form ภ.ง.ด.90 (personal income tax return), tax year 2565 BE (2022), page '
    + '3 of 5 (0-based pageIndex 2). A live AcroForm with 353 fields across the whole document; page 3 '
    + 'was chosen over the other four because it carries the most widgets (105 of 398 total, before '
    + 'exclusion) and the widest mix on one page: 74 combs, 18 radios and 13 free-text cells, laid out '
    + 'as eight repeating income-category sub-tables (items 1-8 under ข้อ 5-7) plus a second table of '
    + 'cost breakdowns by tax-code paragraph. No push button, hidden, no-view, read-only or zero-area '
    + 'widget on this page, so nothing is excluded. Every /Btn on the whole document sets the Radio '
    + 'flag explicitly (measured, not assumed - unlike the 1040, which has none), so every checkbox-'
    + 'shaped mark here is a radio target: the "ร้อยละ 60 / จริง" pairs are real either-or choices, not '
    + 'independent checkboxes. Labels are the form\'s own /TU tooltips (67 of the page\'s 105 widgets '
    + 'carry one); the rest have auto-generated names only (Text312, Radio Button218) and are left '
    + 'unlabelled rather than guessed. Left-to-right, no XFA packet. Generated by '
    + 'scripts/generate-live-form-truth.mjs; regenerate rather than hand-edit.',
};

const thaiLorYor01 = {
  form: 'thai-lor-yor-01-2562',
  file: 'src/tools/sign/fields/corpus/scoring/forms/thai-lor-yor-01-2562.pdf',
  out: 'src/tools/sign/fields/corpus/scoring/ground-truth/thai-lor-yor-01-2562-page1.json',
  sourceUrl: 'https://www.rd.go.th/fileadmin/tax_pdf/withhold/loryor01_290362.pdf',
  pageIndex: 0,
  render: { file: 'thai-lor-yor-01-2562-page1.png', width: 1241, height: 1755 },
  labelFor: thaiLabelFor,
  notes: 'Revenue Department form ล.ย.01 (personal allowances and deductions declaration for '
    + 'withholding tax), issued 2562 BE (2019), one page. A live AcroForm with 47 fields, drawn with '
    + 'very little ink: almost every answer location is a bare comb or radio with no ruled box or '
    + 'leader dots under it. One widget is excluded (a "ล้างข้อมูล" / clear-data push button). Every '
    + '/Btn sets the Radio flag explicitly, same as ภ.ง.ด.90. Only one widget on the page carries a '
    + '/TU tooltip at all (the excluded clear button), so almost none of its 47 targets get a label - '
    + 'every other field has an auto-generated name only (Text1, Radio Button3). That near-total '
    + 'absence of labels is itself part of what this form measures, since the other four scored forms '
    + 'all label most of their targets. No XFA packet. Generated by scripts/generate-live-form-truth.mjs; '
    + 'regenerate rather than hand-edit.',
};

/**
 * USCIS Form I-9, edition 01/20/25. No XFA packet, but every one of page 1's 52 widgets carries
 * its own `/TU` tooltip (Adobe Designer form, not a hand-built one), so labels come from `/TU`
 * exactly as the Thai forms' do - here it covers every target rather than a fraction.
 */
const tuLabelFor = ({ ctx, w }) => textOf(inherited(ctx, w, 'TU'))?.trim() || undefined;

/**
 * Page 1 carries three `/Link` annotations (URI links to uscis.gov/I-9, e.g. under the header and
 * in the "complete the Preparer and/or Translator Certification" sentence) alongside its 52
 * widgets. `collectWidgetTargets` walks every `/Annots` entry with no Subtype check - every other
 * form here happens to have none on its scored page - so this form needs its own excuse to drop
 * them before falling through to the default rule (push button, read-only, hidden, no-view,
 * zero-area).
 */
const uscisI9Excuse = (widget) => {
  const subtype = widget.ctx.lookup(widget.w.get(PDFName.of('Subtype')))?.asString?.();
  if (subtype !== '/Widget') return `not a form widget (${subtype ?? 'no Subtype'})`;
  return defaultExcuse(widget);
};

const uscisI9 = {
  form: 'uscis-i9-2025-01-20',
  file: 'src/tools/sign/fields/corpus/scoring/forms/uscis-i9-2025-01-20.pdf',
  out: 'src/tools/sign/fields/corpus/scoring/ground-truth/uscis-i9-2025-01-20-page1.json',
  sourceUrl: 'https://www.uscis.gov/sites/default/files/document/forms/i-9.pdf',
  pageIndex: 0,
  render: { file: 'uscis-i9-2025-01-20-page1.png', width: 1241, height: 1606 },
  labelFor: tuLabelFor,
  excuse: uscisI9Excuse,
  notes: 'USCIS Form I-9 (Employment Eligibility Verification), edition 01/20/25, page 1 of 4. The '
    + '2023 redesign put Section 1 (Employee Information and Attestation) and Section 2 (Employer '
    + 'Review and Verification, including the List A / List B / List C document table) on one page, '
    + 'so that page is the whole form a person fills; page 2 is the non-fillable List of Acceptable '
    + 'Documents reference table (0 widgets) and pages 3-4 are Supplement A (preparer/translator) '
    + 'and Supplement B (reverification/rehire), used only in edge cases. A live AcroForm with 130 '
    + 'widgets across the document, 52 of them on page 1: 46 text, 1 dropdown (State) and 5 '
    + 'checkboxes (the four citizenship-status options plus the "alternative procedure" box). Page '
    + '1\'s /Annots carries 3 more entries that are /Link, not /Widget (URI links to uscis.gov/I-9 '
    + 'under the header and in the preparer/translator sentence); this form\'s own excuse rule drops '
    + 'them before the default one runs, and among the 52 real widgets nothing is excluded - no push '
    + 'button, hidden, no-view, read-only or zero-area widget anywhere in the file. Only one field '
    + 'sets the Comb flag with MaxLen > 1 (the 9-digit SSN); the ZIP, USCIS '
    + 'A-Number and Form I-94 boxes all carry a MaxLen but not the Comb flag, so they score as text, '
    + 'not comb - measured, not assumed, the same rule the Thai forms use. Every citizenship-status '
    + 'checkbox is its own field with no Radio flag and one widget, exactly like the 1040\'s filing-'
    + 'status boxes, so each is a checkbox target rather than a radio group. The second English form '
    + 'in the corpus (FORM-16), and the first besides the two 1040s: like them it is self-labelling '
    + '(its truth is the widgets formWidgets.js itself reads), so a high recall is partly structural, '
    + 'not earned - what it actually tests is the ink pass staying quiet beside the widget pass on a '
    + 'dense page. Its List A/B/C table is the layout FORM-13\'s caption rule is about: three '
    + 'centred column headings ("List A", "List B", "List C") over repeating blank rows (Document '
    + 'Title / Issuing Authority / Document Number / Expiration Date, three times for List A and '
    + 'once each for List B and List C). All 52 targets carry a label: every widget on this page has '
    + 'its own /TU tooltip, unlike either Thai form. No XFA packet. US federal work, public domain '
    + '(17 U.S.C. 105). Generated by scripts/generate-live-form-truth.mjs; regenerate rather than '
    + 'hand-edit.',
};

const FORMS = {
  'irs-1040': irs1040,
  'thai-pnd90': thaiPnd90,
  'thai-lor-yor-01': thaiLorYor01,
  'uscis-i9': uscisI9,
};

async function run(key, spec) {
  // The 1040's labelFor needs the document loaded first (its captions come from the XFA packet),
  // so it is filled in here rather than at module scope.
  if (key === 'irs-1040') {
    const bytes = fs.readFileSync(spec.file);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const captions = xfaCaptionsByFieldName(xfaTemplateXml(doc));
    spec = { ...spec, labelFor: ({ ctx, w }) => captions.get(qualifiedName(ctx, w)) };
  }
  await generateOne(key, spec);
}

const [, , arg] = process.argv;
if (arg === '--all') {
  for (const [key, spec] of Object.entries(FORMS)) await run(key, spec);
} else if (arg && FORMS[arg]) {
  await run(arg, FORMS[arg]);
} else {
  console.error(`Usage: node scripts/generate-live-form-truth.mjs <${Object.keys(FORMS).join('|')}>`);
  console.error('   or: node scripts/generate-live-form-truth.mjs --all');
  process.exitCode = 2;
}
