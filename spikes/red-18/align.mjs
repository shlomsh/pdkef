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
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFStream, PDFRawStream, PDFNumber, decodePDFRawStream } from '@cantoo/pdf-lib';

const ROOT = process.cwd();
const CORPUS_DIR = path.join(ROOT, 'spikes/red-01/corpus');
const OUT_DIR = path.join(ROOT, 'spikes/red-18/out');

// RED-18 (remove-text.mjs): everything above the "Run over the whole
// corpus" section is also importable, unchanged in behaviour - only the
// corpus-report driver below is gated to this module's own `node
// spikes/red-18/align.mjs` invocation, so a caller that only wants
// rawShowOps/pdfjsShowOps/align (or the smaller parsing pieces) doesn't
// re-run the whole corpus and overwrite results-align.md as a side effect
// of importing.
const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) fs.mkdirSync(OUT_DIR, { recursive: true });

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
  /** BI <dict entries> ID <binary> EI. RED-18: the data's exact extent is
   * knowable in exactly two cases - an explicit /L (/Length) entry, or a
   * single recognised filter that can be decoded to its own natural end
   * (only /Fl /FlateDecode is attempted, using Node's sync zlib with
   * `{info: true}` to read back the exact number of compressed bytes it
   * consumed - the one filter this can do without a bigger decoder). Either
   * way `lengthKnownVia` is set and the mandatory EI is consumed straight
   * after the known-length data, not searched for. Anything else (no /L, no
   * filter, or a filter this can't decode) falls back to the old
   * whitespace-bounded-EI scan - the same fragile heuristic pdf.js's own
   * evaluator uses, and `lengthKnownVia` stays null so the caller can report
   * it as a fallback (see results-fallbacks.md, case 2). */
  readInlineImage(start) {
    const dict = new Map();
    while (this.p < this.n) {
      this.skipWs();
      if (this.b[this.p] === 0x2f) {
        const key = this.readName().value.v;
        const val = this.readValue().value;
        dict.set(key, val);
        continue;
      }
      const kwStart = this.p;
      while (this.p < this.n && isRegular(this.b[this.p])) this.p++;
      const kw = latin1(this.b, kwStart, this.p);
      if (kw === 'ID') break;
      if (this.p === kwStart) { this.p++; }
    }
    if (this.p < this.n && isWs(this.b[this.p])) this.p++; // the one whitespace byte after ID
    const dataStart = this.p;

    const lengthEntry = dict.get('L') ?? dict.get('Length');
    const filterEntry = dict.get('F') ?? dict.get('Filter');
    const filterNames = !filterEntry ? []
      : filterEntry.t === 'name' ? [filterEntry.v]
      : filterEntry.t === 'arr' ? filterEntry.v.filter((v) => v.t === 'name').map((v) => v.v)
      : [];

    let knownLength = null;
    let lengthKnownVia = null;
    if (lengthEntry && lengthEntry.t === 'num' && Number.isFinite(lengthEntry.v) && lengthEntry.v >= 0) {
      knownLength = Math.round(lengthEntry.v);
      lengthKnownVia = 'L';
    } else if (filterNames.length === 1 && (filterNames[0] === 'Fl' || filterNames[0] === 'FlateDecode')) {
      try {
        const remaining = Buffer.from(this.b.buffer, this.b.byteOffset + dataStart, this.n - dataStart);
        const { engine } = zlib.inflateSync(remaining, { info: true });
        knownLength = engine.bytesWritten;
        lengthKnownVia = `filter:${filterNames[0]}`;
      } catch { /* undecodable with what we have; fall through to the EI scan */ }
    }

    let end;
    if (knownLength !== null) {
      end = dataStart + knownLength;
      this.p = end;
      this.skipWs();
      if (this.b[this.p] === 0x45 && this.b[this.p + 1] === 0x49) this.p += 2; // 'EI'
    } else {
      while (this.p < this.n - 1) {
        if (isWs(this.b[this.p]) && this.b[this.p + 1] === 0x45 && this.b[this.p + 2] === 0x49 && (this.p + 3 >= this.n || isWs(this.b[this.p + 3]) || isDelim(this.b[this.p + 3]))) {
          break;
        }
        this.p++;
      }
      end = this.p;
      this.p += 3; // whitespace + 'EI'
    }
    return { op: 'INLINE_IMAGE', args: [], start, end: this.p, dataLength: end - dataStart, lengthKnownVia, filterNames };
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
  let embeddedCMap = false;
  if (isType0) {
    // RED-18: a Type0 font's /Encoding is a PDFName for Identity-H/V and any
    // predefined CMap, but per spec may equally be an indirect reference to
    // an embedded CMap *stream* for a custom/legacy CID font. The old
    // `lookupMaybe(ref, PDFName)` assumed it was always a name and threw
    // (`Expected instance of PDFName, but got instance of PDFRawStream`) the
    // moment a real-world file used the stream form - see
    // results-fallbacks.md case 1. `lookup(key)` with no type arg resolves
    // the reference without throwing regardless of what it turns out to be.
    const enc = fontDict.lookup(PDFName.of('Encoding'));
    if (enc instanceof PDFName) encodingName = enc.asString();
    else if (enc) embeddedCMap = true;
  }
  const cls = { subtype, isType0, isType3: subtype === '/Type3', encodingName, embeddedCMap };
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
    if (cls.embeddedCMap) return { error: 'unsupported cmap (embedded)', codes: [] };
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
 * XObjects on `Do`. Returns {ops, forms, notes, pageBytes, formSources,
 * pageFormInvocations}:
 *   - forms = number of Form XObjects descended into (a form invoked twice
 *     counts twice here, same as before - RED-18 align semantics unchanged).
 *   - notes = non-fatal observations (unresolved XObjects, missing
 *     resources, recursion guards).
 *   - pageBytes = the page's own concatenated Contents bytes (RED-18: the
 *     splice target for page-level ops).
 *   - formSources = Map<xobjStreamObject, {formId, bytes, dict, resources}>,
 *     one entry per DISTINCT Form XObject stream object descended into
 *     (RED-18: the splice target for ops tagged `source.kind === 'form'`).
 *   - pageFormInvocations = [{name, xobj}], the page's own top-level `Do`
 *     calls that resolved to a Form XObject (RED-18: what a form-editing
 *     caller repoints after copying an edited form).
 * Each op now also carries `source`: `{ kind: 'page' }` or
 * `{ kind: 'form', formId, depth }` (RED-18; align.mjs's own report never
 * reads it, so this is purely additive - see results-align.md, unchanged). */
function rawShowOps(node) {
  const ops = [];
  const notes = [];
  let forms = 0;
  const seenRefs = new Set();
  const state = { font: null };
  const pageBytes = pageContentBytes(node);
  const formSources = new Map();
  const pageFormInvocations = [];
  let nextFormId = 0;

  function run(bytes, resources, depth, source) {
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
              if (depth === 0) pageFormInvocations.push({ name: n.v, xobj });
              let formEntry = formSources.get(key);
              if (!formEntry) {
                const formResources = xobj.dict.lookupMaybe(PDFName.of('Resources'), PDFDict) ?? resources;
                formEntry = { formId: nextFormId++, bytes: decodeStreamBytes(xobj), dict: xobj.dict, resources: formResources, xobj };
                formSources.set(key, formEntry);
              }
              const saved = state.font;
              forms++;
              run(formEntry.bytes, formEntry.resources, depth + 1, { kind: 'form', formId: formEntry.formId, depth: depth + 1 });
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
          // RED-18: fontDict is additive (results-fallbacks.md's Type3
          // bbox check needs the actual font dict, not just its
          // classification) - every existing field is unchanged.
          ops.push({ op: o.op, start: o.start, end: o.end, byteLen: combined.length, cls, source, fontDict: state.font, ...decoded });
          break;
        }
        case 'INLINE_IMAGE': {
          // RED-18 (results-fallbacks.md case 2): report, via the existing
          // `notes` channel, whether this inline image's data length was
          // knowable (so the EI that ends it is real, not a guess) or
          // whether the old whitespace-scan heuristic had to be used - never
          // silent either way.
          if (o.lengthKnownVia) {
            notes.push(`inline image: length known via ${o.lengthKnownVia === 'L' ? '/L' : o.lengthKnownVia}`);
          } else {
            const filterNote = o.filterNames.length ? `unsupported filter(s) ${o.filterNames.join(',')}` : 'no /Filter';
            notes.push(`fallback: inline image (length not knowable - no /L, ${filterNote}; used EI-scan heuristic)`);
          }
          break;
        }
        default: break;
      }
    }
  }

  const resources = node.Resources() ?? null;
  run(pageBytes, resources, 0, { kind: 'page' });
  return { ops, forms, notes, pageBytes, formSources, pageFormInvocations };
}

// ---------------------------------------------------------------------------
// RED-18 additional detectors (results-fallbacks.md cases 3, 4 and the
// Type3 check). Each is new, additive surface - none of the functions above
// change what they return for a page that doesn't exercise the construct in
// question, and nothing here is called from the corpus-report driver below
// unless that driver is changed too (it isn't, for spikes/red-01/corpus -
// see results-align.md, still byte-identical).
// ---------------------------------------------------------------------------

/** True if a decoded content stream's bytes contain any text-showing
 * operator (Tj, TJ, ', "), regardless of what draws it. Used to check
 * whether a pattern cell or an annotation appearance stream carries text
 * that the alignment above never looks inside. */
function streamHasTextOps(bytes) {
  const toks = new Tokenizer(bytes).readOperators();
  return toks.some((o) => o.op === 'Tj' || o.op === 'TJ' || o.op === "'" || o.op === '"');
}

/** Every /Name referenced by an `scn`/`SCN` fill-color operator in a
 * decoded content stream. Per spec, `scn`/`SCN` take a trailing pattern
 * name only when the Pattern color space is in effect - a name operand is
 * unambiguous evidence of a pattern fill, so this doesn't need to track
 * `cs`/`CS` state to be correct. */
function collectPatternRefs(bytes) {
  const toks = new Tokenizer(bytes).readOperators();
  const names = new Set();
  for (const o of toks) {
    if (o.op === 'scn' || o.op === 'SCN') {
      const last = o.args[o.args.length - 1];
      if (isName(last)) names.add(last.v);
    }
  }
  return names;
}

function resolvePatternObj(resources, name) {
  if (!resources) return null;
  try {
    const pd = resources.lookupMaybe(PDFName.of('Pattern'), PDFDict);
    return pd?.lookup(PDFName.of(name)) ?? null; // no type arg: never throws on a wrong type
  } catch { return null; }
}

/** RED-18 (results-fallbacks.md case 3): every Pattern name filled via
 * `scn`/`SCN` on the page or in any of its Form XObjects (raw's own
 * `pageBytes`/`formSources`, already computed by `rawShowOps` - not
 * re-walked), resolved and checked, that is a PatternType 1 (tiling)
 * pattern whose own content stream contains a text-showing operator. A
 * hit here means text is painted through the pattern and never reaches
 * either side of `align()` - it must be reported, not treated as covered
 * by a numerically-equal page. Never throws: a malformed Resources/Pattern
 * entry is skipped, not fatal. */
function detectPatternTextFallback(node, raw) {
  const hits = [];
  try {
    const resources = node.Resources() ?? null;
    const sources = [{ resources, bytes: raw.pageBytes }];
    for (const entry of raw.formSources.values()) sources.push({ resources: entry.resources, bytes: entry.bytes });
    const checked = new Set();
    for (const { resources: res, bytes } of sources) {
      for (const name of collectPatternRefs(bytes)) {
        const obj = resolvePatternObj(res, name);
        if (!obj || checked.has(obj)) continue;
        checked.add(obj);
        if (!(obj instanceof PDFStream)) continue; // PatternType 2 (shading): no content stream, no text ops possible
        let patternType;
        try { patternType = obj.dict?.lookupMaybe(PDFName.of('PatternType'), PDFNumber)?.asNumber(); } catch { continue; }
        if (patternType !== 1) continue;
        if (streamHasTextOps(decodeStreamBytes(obj))) hits.push(name);
      }
    }
  } catch { /* never let a detector crash the report; just report nothing found */ }
  return hits;
}

/** RED-18 (results-fallbacks.md case 4): every annotation on the page whose
 * /AP /N appearance stream (direct, or the first text-bearing entry of a
 * sub-dictionary keyed by appearance state) contains a text-showing
 * operator. This is deliberately NOT folded into a "fallback" verdict -
 * annotation appearance text is out of scope for this alignment by
 * `align.mjs`'s own design (`AnnotationMode.DISABLE`, and `rawShowOps`
 * never reads `Annots()`); it exists so a caller building on this spike
 * knows which pages to route to the annotations step (RED-21) instead. */
function detectAnnotationText(node) {
  const hits = [];
  let annots;
  try { annots = node.Annots(); } catch { return hits; }
  if (!annots) return hits;
  for (let i = 0; i < annots.size(); i++) {
    try {
      const annot = annots.lookup(i, PDFDict);
      const subtype = annot.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString() ?? '/Unknown';
      const ap = annot.lookupMaybe(PDFName.of('AP'), PDFDict);
      const n = ap?.lookup(PDFName.of('N'));
      const streams = [];
      if (n instanceof PDFStream) streams.push(n);
      else if (n instanceof PDFDict) {
        for (const v of n.values()) {
          const resolved = n.context.lookup(v);
          if (resolved instanceof PDFStream) streams.push(resolved);
        }
      }
      if (streams.some((s) => streamHasTextOps(decodeStreamBytes(s)))) hits.push({ index: i, subtype });
    } catch { /* one malformed annotation doesn't stop the others */ }
  }
  return hits;
}

/** RED-18 (results-fallbacks.md Type3 case): a Type3 font's glyphs are
 * drawn by arbitrary CharProc content-stream procedures, not bounded by
 * width the way a simple/Type0 font's are - `decodeCodes` returning the
 * right *codes* (which it already does, see `classifyFont`'s isType3
 * branch) says nothing about where a glyph actually draws. This walks
 * every CharProc, tracking `cm`/`q`/`Q` the same way `rawShowOps` tracks
 * font state, and transforms every path-construction operand (`m`, `l`,
 * `c`, `v`, `y`, `re`) through the accumulated CTM - correct because
 * /FontBBox and a CharProc's own operators share one coordinate system
 * (glyph space); FontMatrix maps that space to text space and plays no
 * part in this containment check. Curves are bounded via their control
 * points, which is conservative (a cubic Bezier never leaves the convex
 * hull of its control points) but never optimistic. Returns
 * `{safe, reason}`; `safe: false` is what results-fallbacks.md reports as
 * "fallback: Type3 font". */
function checkType3Bounds(fontDict) {
  try {
    const bboxArr = fontDict.lookupMaybe(PDFName.of('FontBBox'), PDFArray);
    const bboxNums = bboxArr && bboxArr.size() === 4
      ? Array.from({ length: 4 }, (_, i) => { try { return bboxArr.lookup(i, PDFNumber).asNumber(); } catch { return null; } })
      : null;
    if (!bboxNums || bboxNums.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
      return { safe: false, reason: 'no usable /FontBBox' };
    }
    const [bx0, by0, bx1, by1] = bboxNums;
    const minBX = Math.min(bx0, bx1), maxBX = Math.max(bx0, bx1);
    const minBY = Math.min(by0, by1), maxBY = Math.max(by0, by1);
    if (minBX === maxBX && minBY === maxBY) return { safe: false, reason: 'degenerate /FontBBox (zero area)' };

    const charProcs = fontDict.lookupMaybe(PDFName.of('CharProcs'), PDFDict);
    if (!charProcs) return { safe: false, reason: 'no /CharProcs to check' };

    const EPS = 1e-3;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, anyPoint = false;

    for (const [, ref] of charProcs.entries()) {
      let stream;
      try { stream = charProcs.context.lookup(ref); } catch { continue; }
      if (!(stream instanceof PDFStream)) continue;
      const toks = new Tokenizer(decodeStreamBytes(stream)).readOperators();
      let ctm = [1, 0, 0, 1, 0, 0];
      const stack = [];
      let curX = 0, curY = 0;
      const n = (o, i) => (o.args[i] && o.args[i].t === 'num' ? o.args[i].v : 0);
      const tp = (x, y) => {
        const tx = ctm[0] * x + ctm[2] * y + ctm[4];
        const ty = ctm[1] * x + ctm[3] * y + ctm[5];
        minX = Math.min(minX, tx); maxX = Math.max(maxX, tx);
        minY = Math.min(minY, ty); maxY = Math.max(maxY, ty);
        anyPoint = true;
      };
      for (const o of toks) {
        switch (o.op) {
          case 'q': stack.push(ctm); break;
          case 'Q': if (stack.length) ctm = stack.pop(); break;
          case 'cm': {
            const m = [n(o, 0), n(o, 1), n(o, 2), n(o, 3), n(o, 4), n(o, 5)];
            ctm = [
              m[0] * ctm[0] + m[1] * ctm[2],
              m[0] * ctm[1] + m[1] * ctm[3],
              m[2] * ctm[0] + m[3] * ctm[2],
              m[2] * ctm[1] + m[3] * ctm[3],
              m[4] * ctm[0] + m[5] * ctm[2] + ctm[4],
              m[4] * ctm[1] + m[5] * ctm[3] + ctm[5],
            ];
            break;
          }
          case 'm': curX = n(o, 0); curY = n(o, 1); tp(curX, curY); break;
          case 'l': curX = n(o, 0); curY = n(o, 1); tp(curX, curY); break;
          case 'c': tp(n(o, 0), n(o, 1)); tp(n(o, 2), n(o, 3)); tp(n(o, 4), n(o, 5)); curX = n(o, 4); curY = n(o, 5); break;
          case 'v': tp(curX, curY); tp(n(o, 0), n(o, 1)); tp(n(o, 2), n(o, 3)); curX = n(o, 2); curY = n(o, 3); break;
          case 'y': tp(n(o, 0), n(o, 1)); tp(n(o, 2), n(o, 3)); curX = n(o, 2); curY = n(o, 3); break;
          case 're': {
            const x = n(o, 0), y = n(o, 1), w = n(o, 2), h = n(o, 3);
            tp(x, y); tp(x + w, y); tp(x, y + h); tp(x + w, y + h);
            curX = x; curY = y;
            break;
          }
          default: break;
        }
      }
    }

    if (!anyPoint) return { safe: true, reason: 'no path-drawing ops in any CharProc (nothing to bound)' };
    const within = minX >= minBX - EPS && maxX <= maxBX + EPS && minY >= minBY - EPS && maxY <= maxBY + EPS;
    if (within) return { safe: true, reason: `all CharProc drawing within /FontBBox [${bboxNums.join(' ')}]` };
    return { safe: false, reason: `CharProc drawing [${minX.toFixed(2)},${minY.toFixed(2)},${maxX.toFixed(2)},${maxY.toFixed(2)}] exceeds /FontBBox [${bboxNums.join(' ')}]` };
  } catch (e) {
    return { safe: false, reason: `error inspecting Type3 font: ${e.message}` };
  }
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

// RED-18 (remove-text.mjs): the pieces a caller needs to build its own
// per-glyph splice on top of this alignment - the tokenizer, the raw/pdf.js
// op readers and the alignment check itself, plus the byte- and
// font-resolution helpers `rawShowOps` already had to build to do its own
// job. Exporting these changes nothing about what running this file
// directly prints or writes (guarded below by `isMain`).
export {
  Tokenizer,
  rawShowOps,
  pdfjsShowOps,
  align,
  pageContentBytes,
  decodeStreamBytes,
  classifyFont,
  decodeCodes,
  resolveFont,
  resolveExtGStateFont,
  resolveXObject,
  concatBytes,
  // RED-18 additive detectors (results-fallbacks.md); none of the above
  // changed shape or behaviour to add these.
  streamHasTextOps,
  collectPatternRefs,
  resolvePatternObj,
  detectPatternTextFallback,
  detectAnnotationText,
  checkType3Bounds,
};

// ---------------------------------------------------------------------------
// Run over the whole corpus.
// ---------------------------------------------------------------------------

if (isMain) {

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

} // isMain
