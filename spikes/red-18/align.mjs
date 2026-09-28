// @ts-nocheck
// RED-18 spike: the first feasibility question of true redaction. Can every
// text-showing operator pdf.js reports (Tj, TJ, ', ") be lined up with the
// exact bytes of the same operator in the raw content stream, so a later
// tool could edit those bytes directly instead of rebuilding the page?
//
// Two independent readings of each page:
//   - RAW: our own tokenizer over the page's decoded Contents stream(s)
//     (pdf-lib gets us the bytes; the PDF content-stream grammar - numbers,
//     names, strings, arrays, dicts, inline images, comments - is ours),
//     descending into Form XObjects on `Do` in drawing order, tracking the
//     font resource name in effect (Tf, and ExtGState /Font via `gs`), and
//     decoding each show operator's raw string bytes into character codes
//     (1 byte for a simple font; 2 bytes big-endian for a Type0 font whose
//     Encoding is Identity-H/V; anything else is reported, not guessed).
//   - PDF.JS: the operator list's OPS.showText entries, in order. Each
//     glyph pdf.js decoded carries `originalCharCode` (see
//     pdf.worker.mjs's Glyph class and PartialEvaluator#handleText); we
//     collect those per op, ignoring the plain numbers TJ mixes in for
//     kerning (`pageGlyphs.ts` does the same for width, not for alignment).
//
// A page aligns only if the two op lists are the same length and every
// op's code sequence matches, index for index. Run from the repo root:
//   node spikes/red-18/align.mjs
//
// Not part of the app; measures, does not touch src/.

import fs from 'node:fs';
import path from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFStream, PDFRawStream, decodePDFRawStream } from '@cantoo/pdf-lib';

const ROOT = process.cwd();
const CORPUS_DIR = path.join(ROOT, 'spikes/red-01/corpus');
const OUT_DIR = path.join(ROOT, 'spikes/red-18/out');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// PDF content-stream tokenizer. Pure byte-level parsing: no pdf-lib parser
// reuse (its content-stream reader is private API), just the PDF spec's
// object syntax (ISO 32000-1 §7.2-7.3) applied to one stream's bytes.
// Every operand is tagged {t, v}: 'num' | 'name' | 'str' (decoded bytes,
// Uint8Array) | 'arr' (array of tagged values) | 'dict' (Map) | 'bool' |
// 'null'. Every recognised operator becomes {op, args, start, end} with a
// byte range from its first operand (or itself, if none) to the end of the
// operator keyword.
// ---------------------------------------------------------------------------

const isWs = (b) => b === 0x00 || b === 0x09 || b === 0x0a || b === 0x0c || b === 0x0d || b === 0x20;
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);
const isDelim = (b) => DELIM.has(b);
const isRegular = (b) => b !== undefined && !isWs(b) && !isDelim(b);
const isNumStart = (b) => (b >= 0x30 && b <= 0x39) || b === 0x2b || b === 0x2d || b === 0x2e;
const latin1 = (bytes, start, end) => Buffer.from(bytes.buffer, bytes.byteOffset + start, end - start).toString('latin1');

class Tokenizer {
  constructor(bytes) {
    this.b = bytes;
    this.p = 0;
    this.n = bytes.length;
  }
  skipWs() {
    for (;;) {
      while (this.p < this.n && isWs(this.b[this.p])) this.p++;
      if (this.p < this.n && this.b[this.p] === 0x25 /* % comment */) {
        while (this.p < this.n && this.b[this.p] !== 0x0a && this.b[this.p] !== 0x0d) this.p++;
        continue;
      }
      break;
    }
  }
  readName() {
    const start = this.p;
    this.p++; // '/'
    const chars = [];
    while (this.p < this.n && isRegular(this.b[this.p])) {
      if (this.b[this.p] === 0x23 /* # */ && this.p + 2 < this.n && isHex(this.b[this.p + 1]) && isHex(this.b[this.p + 2])) {
        chars.push(parseInt(latin1(this.b, this.p + 1, this.p + 3), 16));
        this.p += 3;
      } else {
        chars.push(this.b[this.p]);
        this.p++;
      }
    }
    return { value: { t: 'name', v: Buffer.from(chars).toString('latin1') }, start, end: this.p };
  }
  readNumber() {
    const start = this.p;
    while (this.p < this.n && (isNumStart(this.b[this.p]) || this.b[this.p] === 0x65 || this.b[this.p] === 0x45)) this.p++;
    const s = latin1(this.b, start, this.p);
    const v = parseFloat(s);
    return { value: { t: 'num', v: Number.isFinite(v) ? v : 0 }, start, end: this.p };
  }
  readLiteralString() {
    const start = this.p;
    this.p++; // '('
    let depth = 1;
    const bytes = [];
    while (this.p < this.n && depth > 0) {
      const c = this.b[this.p];
      if (c === 0x5c /* \ */) {
        this.p++;
        const e = this.b[this.p];
        if (e === 0x6e) { bytes.push(0x0a); this.p++; }
        else if (e === 0x72) { bytes.push(0x0d); this.p++; }
        else if (e === 0x74) { bytes.push(0x09); this.p++; }
        else if (e === 0x62) { bytes.push(0x08); this.p++; }
        else if (e === 0x66) { bytes.push(0x0c); this.p++; }
        else if (e === 0x28 || e === 0x29 || e === 0x5c) { bytes.push(e); this.p++; }
        else if (e === 0x0d) { this.p++; if (this.b[this.p] === 0x0a) this.p++; }
        else if (e === 0x0a) { this.p++; }
        else if (e >= 0x30 && e <= 0x37) {
          let oct = '';
          for (let k = 0; k < 3 && this.b[this.p] >= 0x30 && this.b[this.p] <= 0x37; k++) { oct += String.fromCharCode(this.b[this.p]); this.p++; }
          bytes.push(parseInt(oct, 8) & 0xff);
        } else if (e === undefined) { break; }
        else { bytes.push(e); this.p++; }
      } else if (c === 0x28) { depth++; bytes.push(c); this.p++; }
      else if (c === 0x29) { depth--; this.p++; if (depth > 0) bytes.push(c); }
      else if (c === 0x0d) { bytes.push(0x0a); this.p++; if (this.b[this.p] === 0x0a) this.p++; }
      else { bytes.push(c); this.p++; }
    }
    return { value: { t: 'str', v: Uint8Array.from(bytes) }, start, end: this.p };
  }
  readHexString() {
    const start = this.p;
    this.p++; // '<'
    const hex = [];
    while (this.p < this.n && this.b[this.p] !== 0x3e) {
      if (isHex(this.b[this.p])) hex.push(this.b[this.p]);
      this.p++;
    }
    this.p++; // '>'
    if (hex.length % 2) hex.push(0x30);
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(Buffer.from([hex[i * 2], hex[i * 2 + 1]]).toString('latin1'), 16);
    return { value: { t: 'str', v: bytes }, start, end: this.p };
  }
  readArray() {
    const start = this.p;
    this.p++; // '['
    const vals = [];
    for (;;) {
      this.skipWs();
      if (this.p >= this.n || this.b[this.p] === 0x5d) { if (this.p < this.n) this.p++; break; }
      vals.push(this.readValue().value);
    }
    return { value: { t: 'arr', v: vals }, start, end: this.p };
  }
  readDict() {
    const start = this.p;
    this.p += 2; // '<<'
    const m = new Map();
    for (;;) {
      this.skipWs();
      if (this.p >= this.n) break;
      if (this.b[this.p] === 0x3e && this.b[this.p + 1] === 0x3e) { this.p += 2; break; }
      if (this.b[this.p] !== 0x2f) { this.p++; continue; } // malformed; resync
      const key = this.readName().value.v;
      const val = this.readValue().value;
      m.set(key, val);
    }
    return { value: { t: 'dict', v: m }, start, end: this.p };
  }
  /** A value in a nested position (array/dict element): any object, plus
   * the keyword literals true/false/null. */
  readValue() {
    this.skipWs();
    const c = this.b[this.p];
    if (c === 0x2f) return this.readName();
    if (c === 0x28) return this.readLiteralString();
    if (c === 0x3c) return this.b[this.p + 1] === 0x3c ? this.readDict() : this.readHexString();
    if (c === 0x5b) return this.readArray();
    if (isNumStart(c)) return this.readNumber();
    const start = this.p;
    while (this.p < this.n && isRegular(this.b[this.p])) this.p++;
    if (this.p === start) { this.p++; return { value: { t: 'null', v: null }, start, end: this.p }; }
    const kw = latin1(this.b, start, this.p);
    if (kw === 'true') return { value: { t: 'bool', v: true }, start, end: this.p };
    if (kw === 'false') return { value: { t: 'bool', v: false }, start, end: this.p };
    return { value: { t: 'null', v: null }, start, end: this.p };
  }
  /** Every operator in the stream, in order, with its operands. Also
   * returns any inline images found (BI..ID..EI), as opaque ops. */
  readOperators() {
    const ops = [];
    let operands = [];
    while (this.p < this.n) {
      this.skipWs();
      if (this.p >= this.n) break;
      const c = this.b[this.p];
      if (c === 0x2f) { operands.push(this.readName()); continue; }
      if (c === 0x28) { operands.push(this.readLiteralString()); continue; }
      if (c === 0x3c) { operands.push(this.b[this.p + 1] === 0x3c ? this.readDict() : this.readHexString()); continue; }
      if (c === 0x5b) { operands.push(this.readArray()); continue; }
      if (isNumStart(c)) { operands.push(this.readNumber()); continue; }
      const kwStart = this.p;
      while (this.p < this.n && isRegular(this.b[this.p])) this.p++;
      if (this.p === kwStart) { this.p++; continue; } // stray delimiter (]/}/>), resync
      const kw = latin1(this.b, kwStart, this.p);
      const kwEnd = this.p;
      if (kw === 'true') { operands.push({ value: { t: 'bool', v: true }, start: kwStart, end: kwEnd }); continue; }
      if (kw === 'false') { operands.push({ value: { t: 'bool', v: false }, start: kwStart, end: kwEnd }); continue; }
      if (kw === 'null') { operands.push({ value: { t: 'null', v: null }, start: kwStart, end: kwEnd }); continue; }
      if (kw === 'BI') { ops.push(this.readInlineImage(kwStart)); operands = []; continue; }
      const start = operands.length ? operands[0].start : kwStart;
      ops.push({ op: kw, args: operands.map((o) => o.value), start, end: kwEnd });
      operands = [];
    }
    return ops;
  }
  /** BI <dict entries> ID <binary> EI. No /L (Length) support attempted
   * (rare in content streams); scans for a whitespace-bounded EI, the same
   * heuristic simple PDF parsers use. */
  readInlineImage(start) {
    while (this.p < this.n) {
      this.skipWs();
      if (this.b[this.p] === 0x2f) { this.readName(); this.readValue(); continue; }
      const kwStart = this.p;
      while (this.p < this.n && isRegular(this.b[this.p])) this.p++;
      const kw = latin1(this.b, kwStart, this.p);
      if (kw === 'ID') break;
      if (this.p === kwStart) { this.p++; }
    }
    if (this.p < this.n && isWs(this.b[this.p])) this.p++; // the one whitespace byte after ID
    const dataStart = this.p;
    while (this.p < this.n - 1) {
      if (isWs(this.b[this.p]) && this.b[this.p + 1] === 0x45 && this.b[this.p + 2] === 0x49 && (this.p + 3 >= this.n || isWs(this.b[this.p + 3]) || isDelim(this.b[this.p + 3]))) {
        break;
      }
      this.p++;
    }
    const end = this.p;
    this.p += 3; // whitespace + 'EI'
    return { op: 'INLINE_IMAGE', args: [], start, end: end + 3, dataLength: end - dataStart };
  }
}
const isHex = (b) => (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x46) || (b >= 0x61 && b <= 0x66);

// ---------------------------------------------------------------------------
// pdf-lib side: page structure, Form XObject recursion, font resolution.
// ---------------------------------------------------------------------------

const isName = (v) => v && v.t === 'name';
const isStr = (v) => v && v.t === 'str';
const isArr = (v) => v && v.t === 'arr';

function decodeStreamBytes(stream) {
  if (stream instanceof PDFRawStream) return decodePDFRawStream(stream).decode();
  if (stream && typeof stream.getContents === 'function') return stream.getContents();
  return new Uint8Array();
}

function pageContentBytes(node) {
  const c = node.Contents();
  if (!c) return new Uint8Array();
  const streams = c instanceof PDFArray ? Array.from({ length: c.size() }, (_, i) => c.lookup(i, PDFStream)) : [c];
  const parts = streams.map(decodeStreamBytes);
  const total = parts.reduce((n, p) => n + p.length, 0) + Math.max(0, parts.length - 1);
  const out = new Uint8Array(total);
  let off = 0;
  parts.forEach((p, i) => {
    out.set(p, off);
    off += p.length;
    if (i < parts.length - 1) out[off++] = 0x0a;
  });
  return out;
}

const fontCache = new WeakMap();
function classifyFont(fontDict) {
  if (!fontDict) return null;
  if (fontCache.has(fontDict)) return fontCache.get(fontDict);
  const subtype = fontDict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString();
  const isType0 = subtype === '/Type0';
  let encodingName = null;
  if (isType0) encodingName = fontDict.lookupMaybe(PDFName.of('Encoding'), PDFName)?.asString() ?? null;
  const cls = { subtype, isType0, isType3: subtype === '/Type3', encodingName };
  fontCache.set(fontDict, cls);
  return cls;
}

function decodeCodes(bytes, cls) {
  if (!cls) return { error: 'no font in effect', codes: [] };
  if (cls.isType0) {
    if (cls.encodingName === '/Identity-H' || cls.encodingName === '/Identity-V') {
      if (bytes.length % 2 !== 0) return { error: 'odd byte length for a 2-byte CMap', codes: [] };
      const codes = [];
      for (let i = 0; i < bytes.length; i += 2) codes.push((bytes[i] << 8) | bytes[i + 1]);
      return { codes };
    }
    return { error: `unsupported cmap (${cls.encodingName ?? 'embedded or unresolved'})`, codes: [] };
  }
  return { codes: Array.from(bytes) };
}

function resolveFont(resources, name) {
  if (!resources) return null;
  const fonts = resources.lookupMaybe(PDFName.of('Font'), PDFDict);
  return fonts?.lookupMaybe(PDFName.of(name), PDFDict) ?? null;
}
function resolveExtGStateFont(resources, name) {
  if (!resources) return null;
  const ext = resources.lookupMaybe(PDFName.of('ExtGState'), PDFDict);
  const gs = ext?.lookupMaybe(PDFName.of(name), PDFDict);
  const arr = gs?.lookupMaybe(PDFName.of('Font'), PDFArray);
  return arr?.lookupMaybe(0, PDFDict) ?? null;
}
function resolveXObject(resources, name) {
  if (!resources) return null;
  const xd = resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
  return xd?.lookupMaybe(PDFName.of(name), PDFStream) ?? null;
}
function concatBytes(list) {
  const total = list.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of list) { out.set(b, off); off += b.length; }
  return out;
}

/** Every Tj/TJ/'/" op on a page, in drawing order, descending into Form
 * XObjects on `Do`. Returns {ops, forms, notes}: forms = number of Form
 * XObjects descended into; notes = non-fatal observations (unresolved
 * XObjects, missing resources, recursion guards). */
function rawShowOps(node) {
  const ops = [];
  const notes = [];
  let forms = 0;
  const seenRefs = new Set();
  const state = { font: null };

  function run(bytes, resources, depth) {
    if (depth > 15) { notes.push('form recursion depth exceeded (15); stopped descending'); return; }
    const toks = new Tokenizer(bytes).readOperators();
    const fontStack = [];
    for (const o of toks) {
      switch (o.op) {
        case 'q': fontStack.push(state.font); break;
        case 'Q': if (fontStack.length) state.font = fontStack.pop(); break;
        case 'Tf': {
          const n = o.args[0];
          if (isName(n)) state.font = resolveFont(resources, n.v);
          break;
        }
        case 'gs': {
          const n = o.args[0];
          if (isName(n)) { const f = resolveExtGStateFont(resources, n.v); if (f) state.font = f; }
          break;
        }
        case 'Do': {
          const n = o.args[0];
          if (isName(n)) {
            const xobj = resolveXObject(resources, n.v);
            if (!xobj) { notes.push(`Do /${n.v}: XObject not found in Resources`); break; }
            const subtype = xobj.dict?.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString();
            if (subtype === '/Form') {
              const key = xobj; // pdf-lib returns the same object instance per ref
              if (seenRefs.has(key)) { notes.push(`Do /${n.v}: skipped a cyclic form reference`); break; }
              seenRefs.add(key);
              const formResources = xobj.dict.lookupMaybe(PDFName.of('Resources'), PDFDict) ?? resources;
              const formBytes = decodeStreamBytes(xobj);
              const saved = state.font;
              forms++;
              run(formBytes, formResources, depth + 1);
              state.font = saved;
              seenRefs.delete(key);
            }
          }
          break;
        }
        case 'Tj': case "'": case '"': case 'TJ': {
          let pieces = [];
          if (o.op === 'Tj' || o.op === "'") { const s = o.args[o.args.length - 1]; if (isStr(s)) pieces = [s.v]; }
          else if (o.op === '"') { const s = o.args[2]; if (isStr(s)) pieces = [s.v]; }
          else if (o.op === 'TJ') { const arr = o.args[0]; if (isArr(arr)) pieces = arr.v.filter(isStr).map((s) => s.v); }
          const combined = concatBytes(pieces);
          const cls = classifyFont(state.font);
          const decoded = decodeCodes(combined, cls);
          ops.push({ op: o.op, start: o.start, end: o.end, byteLen: combined.length, cls, ...decoded });
          break;
        }
        default: break;
      }
    }
  }

  const resources = node.Resources() ?? null;
  run(pageContentBytes(node), resources, 0);
  return { ops, forms, notes };
}

// ---------------------------------------------------------------------------
// pdf.js side: the operator list's showText ops, unfiltered.
// ---------------------------------------------------------------------------

async function pdfjsShowOps(bytes, pageNo) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const page = await doc.getPage(pageNo);
  const opList = await page.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE });
  const ops = [];
  for (let i = 0; i < opList.fnArray.length; i++) {
    if (opList.fnArray[i] !== pdfjs.OPS.showText) continue;
    const items = opList.argsArray[i]?.[0] ?? [];
    const codes = items.filter((it) => typeof it !== 'number' && it && typeof it.originalCharCode === 'number').map((it) => it.originalCharCode);
    ops.push({ codes, itemCount: items.length });
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Alignment.
// ---------------------------------------------------------------------------

function align(rawOps, pdfjsOps) {
  if (rawOps.length !== pdfjsOps.length) {
    return { aligned: false, firstMismatch: { kind: 'op count', raw: rawOps.length, pdfjs: pdfjsOps.length } };
  }
  for (let i = 0; i < rawOps.length; i++) {
    const r = rawOps[i];
    if (r.error) return { aligned: false, firstMismatch: { kind: 'raw decode', index: i, op: r.op, error: r.error } };
    const p = pdfjsOps[i];
    const rc = r.codes ?? [];
    const pc = p.codes ?? [];
    if (rc.length !== pc.length) return { aligned: false, firstMismatch: { kind: 'code count', index: i, op: r.op, raw: rc.length, pdfjs: pc.length } };
    for (let j = 0; j < rc.length; j++) {
      if (rc[j] !== pc[j]) return { aligned: false, firstMismatch: { kind: 'code value', index: i, op: r.op, at: j, raw: rc[j], pdfjs: pc[j] } };
    }
  }
  return { aligned: true, firstMismatch: null };
}

// ---------------------------------------------------------------------------
// Run over the whole corpus.
// ---------------------------------------------------------------------------

const files = fs.readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.pdf')).sort();
const fileResults = [];

for (const file of files) {
  const bytes = new Uint8Array(fs.readFileSync(path.join(CORPUS_DIR, file)));
  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    fileResults.push({ file, error: `pdf-lib failed to load: ${e.message}`, pages: [] });
    continue;
  }
  const pages = pdfDoc.getPages();
  const pageResults = [];
  for (let i = 0; i < pages.length; i++) {
    let raw;
    try {
      raw = rawShowOps(pages[i].node);
    } catch (e) {
      pageResults.push({ page: i + 1, error: `raw tokenizer threw: ${e.stack ?? e.message}` });
      continue;
    }
    let pdfjsOps;
    try {
      pdfjsOps = await pdfjsShowOps(bytes, i + 1);
    } catch (e) {
      pageResults.push({ page: i + 1, error: `pdf.js failed: ${e.message}` });
      continue;
    }
    const result = align(raw.ops, pdfjsOps);
    pageResults.push({
      page: i + 1,
      rawCount: raw.ops.length,
      pdfjsCount: pdfjsOps.length,
      forms: raw.forms,
      notes: raw.notes,
      ...result,
    });
  }
  fileResults.push({ file, pages: pageResults });
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------

let totalPages = 0;
let alignedPages = 0;
let filesFullyAligned = 0;
const causeCounts = new Map();

const lines = [];
for (const fr of fileResults) {
  if (fr.error) {
    lines.push(`## ${fr.file}\n\nFile-level error: ${fr.error}\n`);
    continue;
  }
  const allAligned = fr.pages.length > 0 && fr.pages.every((p) => p.aligned);
  if (allAligned) filesFullyAligned++;
  lines.push(`## ${fr.file} (${fr.pages.length} page${fr.pages.length === 1 ? '' : 's'}, ${allAligned ? 'all aligned' : 'NOT all aligned'})\n`);
  for (const p of fr.pages) {
    totalPages++;
    if (p.error) {
      lines.push(`- page ${p.page}: ERROR - ${p.error}`);
      causeCounts.set('harness error', (causeCounts.get('harness error') ?? 0) + 1);
      continue;
    }
    if (p.aligned) {
      alignedPages++;
      lines.push(`- page ${p.page}: aligned. raw ${p.rawCount} show ops = pdf.js ${p.pdfjsCount}, ${p.forms} form XObject${p.forms === 1 ? '' : 's'} descended into.${p.notes.length ? ` Notes: ${p.notes.join('; ')}.` : ''}`);
    } else {
      const m = p.firstMismatch;
      const causeKey = m.kind === 'raw decode' ? m.error : m.kind;
      causeCounts.set(causeKey, (causeCounts.get(causeKey) ?? 0) + 1);
      lines.push(`- page ${p.page}: FAILS. raw ${p.rawCount} show ops, pdf.js ${p.pdfjsCount}, ${p.forms} form XObject${p.forms === 1 ? '' : 's'} descended into. First mismatch: ${JSON.stringify(m)}.${p.notes.length ? ` Notes: ${p.notes.join('; ')}.` : ''}`);
    }
  }
  lines.push('');
}

const summary = [
  '# RED-18: lining up pdf.js show-text ops with the raw content stream',
  '',
  `${filesFullyAligned} of ${fileResults.length} files align on every page. ${alignedPages} of ${totalPages} pages align.`,
  '',
  'Failure causes (first mismatch per failing page, counted once each):',
  ...(causeCounts.size ? [...causeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`) : ['- none, every page aligned']),
  '',
  '---',
  '',
];

fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify({ totalFiles: fileResults.length, filesFullyAligned, totalPages, alignedPages, causes: Object.fromEntries(causeCounts) }, null, 2));
fs.writeFileSync(path.join(ROOT, 'spikes/red-18/results-align.md'), summary.join('\n') + lines.join('\n') + '\n');
console.log(summary.join('\n'));
console.log(lines.join('\n'));
