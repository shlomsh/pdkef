# MOBI-10 spike: `@firecrawl/anydoc-wasm` recon

Question: does `@firecrawl/anydoc-wasm` (wraps the Rust crate `pdf-inspector`) tell us **where**
input fields are on a flat, non-fillable PDF form? Not Markdown quality, not RTL quality — field
*location* metadata.

**Verdict up front: no.** For PDF input, this library has exactly one output mode (Markdown), no
document-model / JSON mode, and no field anywhere in its type surface holds a bounding box, a
rect, a position, or even a page index. See "Coordinate availability" below for the full chain of
evidence.

## Versions, license, sizes

- npm: `@firecrawl/anydoc-wasm` latest is **0.2.4**, published 2026-08-27T19:11:58Z. Full version
  list (`npm view @firecrawl/anydoc-wasm versions`): 0.1.4 .. 0.1.9, 0.2.0 .. 0.2.4.
- License: **MIT** (`npm view @firecrawl/anydoc-wasm license`).
- `dist.unpackedSize` (npm view): 6,720,410 bytes.
- Installed on disk (`scripts/spike/mobi-10/node_modules/@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm`):
  **6,691,779 bytes**; gzip (`gzip -c anydoc_wasm_bg.wasm | wc -c`): **2,921,514 bytes**.
- `pdf-inspector` version resolved into this npm release: **1.14.2**. Established by fetching
  `Cargo.lock` at the git tag matching the npm version (`gh api
  "repos/firecrawl/anydoc/contents/Cargo.lock?ref=v0.2.4" --jq '.content' | base64 -d | grep -A2
  'name = "pdf-inspector"'`):
  ```
  name = "pdf-inspector"
  version = "1.14.2"
  source = "registry+https://github.com/rust-lang/crates.io-index"
  ```

## Upstream issue/PR status (checked via `gh`)

- `gh issue view 170 --repo firecrawl/anydoc`: **OPEN**, filed by shlomsh. States `Cargo.lock` on
  `main` pins `pdf-inspector` to 1.14.2, which predates the RTL visual-order fix
  (`pdf-inspector#440`, merged 2026-08-21) and the digit-only-Arabic-voting-RTL fix
  (`pdf-inspector#441`, same window). Both landed in `pdf-inspector` 1.16.0; latest at issue time
  was 1.19.0.
- `gh pr view 175 --repo firecrawl/anydoc`: **OPEN, not merged**, by shlomsh. Closes #170. Bumps
  `Cargo.toml`/`Cargo.lock` to `pdf-inspector` **1.20.0** (current release at PR time), regenerated
  with `cargo update -p pdf-inspector`; `lopdf` moves 0.42 → 0.45 transitively. One snapshot changes
  (`pdf/text.pdf`); local CI (`cargo clippy`, `cargo test --locked`, `cargo check --workspace`)
  reported green in the PR body. As of 2026-09-17 this has not been merged and no new npm release
  has shipped, so **the published `@firecrawl/anydoc-wasm@0.2.4` still reverses Hebrew/Arabic/
  Persian text** stored in visual order (see RTL indicator below).

## API surface (quoted from `anydoc_wasm.d.ts`, package 0.2.4)

Exported functions:

```ts
export function formatFromBytes(bytes: Uint8Array): Format | undefined;
export function formatFromExtension(extension: string): Format | undefined;
export function formatFromPath(path: string): Format | undefined;
export function toDocument(bytes: Uint8Array, format?: Format | null): Document;
export function toMarkdownBytes(bytes: Uint8Array, format?: Format | null): string;
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;
export default function __wbg_init(module_or_path?: ...): Promise<InitOutput>;
```

`toDocument`'s own doc comment is explicit about PDF:

```ts
/**
 * Parse an in-memory document into the document model, which also carries
 * the embedded assets. Without a format, it is detected from the content.
 *
 * Unsupported for `pdf`: PDF conversion produces Markdown directly and has
 * no document-model form; use `toMarkdownBytes`.
 *
 * Throws an `Error` carrying a `ConvertErrorCode` on `code`.
 */
```

So there are exactly two output modes total in this package, and only one (`toMarkdownBytes`)
accepts PDF. There is no third "layout"/"blocks"/"json" mode; the README's usage example
(`node_modules/@firecrawl/anydoc-wasm/README.md`) confirms the same two entry points.

The `Document` model that `toDocument` *would* return (for non-PDF formats) has no geometry either.
Full type surface, quoted verbatim:

```ts
export interface Document {
    blocks: Array<Block>
    notes: Array<Note>
    assets: Array<Asset>
}
export type BlockKind = 'heading' | 'paragraph' | 'list' | 'table' | 'blockQuote' | 'codeBlock' | 'rule' | 'math'
export interface Block {
    kind: BlockKind
    level?: number       // heading: 1-6
    anchor?: string       // heading: stable anchor id
    content?: Array<Inline>  // heading, paragraph
    list?: List
    table?: Table
    blocks?: Array<Block>  // blockQuote
    lang?: string          // codeBlock
    text?: string          // codeBlock, math
}
export type InlineKind = 'text' | 'link' | 'image' | 'anchor' | 'noteRef' | 'lineBreak' | 'math' | 'checkbox'
export interface Inline {
    kind: InlineKind
    text?: string
    style?: Style
    content?: Array<Inline>   // link
    target?: LinkTarget       // link
    alt?: string              // image
    source?: ImageSource      // image
    anchor?: string           // anchor
    noteId?: string           // noteRef
    checked?: boolean         // checkbox: its state
}
export interface Table {
    grid: Array<Array<CellSlot>>
    headerRows: number
    kind: TableKind   // 'data' | 'layout'
}
export interface Cell {
    blocks: Array<Block>
    colSpan: number
    rowSpan: number
}
```

Grep of the entire `.d.ts` for `x`, `y`, `rect`, `bounds`, `position`, `bbox`, `page` (case
insensitive) turns up nothing on any interface — confirmed by reading the file directly
(`scripts/spike/mobi-10/node_modules/@firecrawl/anydoc-wasm/anydoc_wasm.d.ts`, 318 lines, read in
full). There is an `Inline.kind === 'checkbox'` with a `checked: boolean` state, which is the
closest thing to "field" semantics in the whole surface, and it too carries no location, no page
index, and it is unreachable for PDF anyway since `toDocument` is unsupported for that format.

## What each mode emitted for each form

Run with `scripts/spike/mobi-10/anydoc-run.mjs --input <pdf> --out <dir>`, one process per PDF
(per the brief's note that the wasm module has OOM'd V8 under sustained reuse; not hit here, but
kept isolated regardless). Wall times are the full process (node startup + wasm `initSync` + one
conversion + one `toDocument` attempt):

| Form | `toMarkdownBytes` | `toDocument` | Process wall time |
| --- | --- | --- | --- |
| itc101.pdf (2pp) | ok, 89.7ms, 8785 chars | **threw**, 5.4ms, `code: 'unsupported'` | 0.371s |
| health.pdf (1pp) | ok, 166.3ms, 3917 chars | **threw**, 4.9ms, `code: 'unsupported'` | 0.444s |

`toDocument`'s thrown message in both cases: `"unsupported input: PDF converts directly to
Markdown; use to_markdown or to_markdown_bytes"` — matches the `.d.ts` doc comment exactly. Raw
error payloads: `scripts/spike/mobi-10/... /out/{itc101,health}/anydoc.document.error.json`
(scratchpad, not committed).

**Block-type counts:** not applicable in the structured sense — there is no `Document` for PDF, so
there are no `Block`/`Inline` counts to report. Describing the Markdown output's shape instead
(`out/itc101/anydoc.markdown.md`, 95 lines / 8785 chars total):

- 7 Markdown table pipe-rows (`^|`) — pdf-inspector reconstructs the form's visual grid as
  GFM tables, one wide row per visual line, columns split wherever it detected a gap.
- 10 heading lines (`^#`), used for the form's section titles ("ח", "י", etc.) and a few `<u>`-wrapped
  runs for underlined instruction text.
- 1 run of 3+ underscores total across the whole document — the underscore-based signature/date
  blanks on the form are *not* reliably reproduced as underscore runs; most are simply absent from
  the text.
- Checkboxes: the form's `√`/`o` checkbox marks come through as literal `√` and `o` characters
  inlined into cell text (e.g. `|םיאתמה עובירב √ י/ןמס|`), not as a distinguishable field, not as
  the `checkbox` `InlineKind` (unreachable for PDF), and with no way to tell "this box is checked"
  from "this box exists" from plain text alone.
- `health.pdf`'s ten yes/no medical questions each became one Markdown table row with **literal
  `אל`/`ןכ` ("no"/"yes") text in adjacent cells** and no field/checkbox markup distinguishing them
  from body text:
  ```
  |אל||ןכ|?תונורחא ה םינש 5 -|ב הרכה דוביא לש עוריא תרבע םאה. 1 ?יתמ ,ןכ םא|
  |אל||ןכ||?לקשמ יוויש רסוחו תורוחרחסמ לבוס ךניה םאה. 2|
  ```
  (redacted sample, capped per the brief; full output in the scratchpad `out/` files, not
  committed.)
- **No page markers of any kind.** Grepped the raw Markdown for `page`, `\f`, and `---` (case
  insensitive): the only hits are the Markdown table rule rows (`|---|---|...|`), not page breaks.
  A 2-page PDF (itc101) produces one undifferentiated string with no indication where page 1 ends
  and page 2 begins — confirmed only by manually locating the form's own printed page-2 header text
  ("עמוד 2 מתוך 2 ... טופס 101", reversed) inside the string.

## Coordinate availability verdict

**Nothing in anydoc-wasm's output, for a PDF, carries a coordinate.** Chain of evidence:

1. `toDocument` (the only structured/JSON mode) is documented as unsupported for `pdf` and
   empirically throws `code: 'unsupported'` for both test files (see table above).
2. Even the `Document`/`Block`/`Inline`/`Table`/`Cell` types that `toDocument` *would* return for
   other formats have zero geometry fields anywhere (full type surface quoted above).
3. The only PDF-capable mode, `toMarkdownBytes`, returns a plain string with no page markers and,
   naturally, no coordinates.

Per the brief: since nothing carries coordinates, `anydoc-to-candidates.mjs`
(`scripts/spike/mobi-10/anydoc-to-candidates.mjs`) does not attempt to parse anything — there is
nothing to parse — and unconditionally writes an empty `CandidateField[]` array to
`candidates.pdf-inspector.json` for both forms, with a console message explaining why. No boxes
were fabricated from the Markdown. Coordinate-origin verification (CONTRACT.md's "verify the
coordinate origin empirically" step) is **not applicable**: there are no coordinates to verify an
origin for.

## RTL indicator (page-1 text, itc101.pdf; whole document, health.pdf)

Method: in the raw `toMarkdownBytes` output, matched every maximal run of Hebrew letters
(`/[א-ת]+/g`) as a "word," then counted how many start with one of the five final-form
letters (ם ן ץ ף ך) — legal in standard Hebrew orthography only at the *end* of a word, so a high
rate is a direct signal of character-level reversal.

- **itc101.pdf, page-1 slice** (text before the page-2 footer marker "ףד תוהז רפסמ2 ךותמ 2 101",
  found at character offset 2842 of 8785 in the raw Markdown): **114 of 494** Hebrew words
  (23.1%) start with a final-form letter. Examples: `ךותמ, ףד, םיאתמה, ןמס, םימי, ךות, ךכ,
  םיטרפב, םא, םואיתלו`.
- **health.pdf, whole document** (1 page, no split needed): **167 of 659** Hebrew words (25.3%)
  start with a final-form letter.

Both numbers are far above what correct Hebrew orthography would produce (final forms are rare
word-initially — essentially typos or loanwords), consistent with the reversed-visual-order bug
tracked in upstream issue #170 and fixed only in the still-unmerged PR #175. This corroborates,
without needing to re-derive it, what #170 already documents: `pdf-inspector` 1.14.2 (the version
actually shipped in `@firecrawl/anydoc-wasm@0.2.4`) reverses RTL runs.

## Files

- `scripts/spike/mobi-10/package.json`, `anydoc-run.mjs`, `anydoc-to-candidates.mjs` — this recon.
- Scratchpad (not committed): `out/itc101/{anydoc.markdown.md, anydoc.document.error.json,
  candidates.pdf-inspector.json}`, `out/health/{same}`.

## Answer

**Can this library tell us WHERE the input fields are on a flat form? No.** For PDF input,
`@firecrawl/anydoc-wasm` 0.2.4 has exactly one output mode — Markdown text — and its structured
`toDocument` mode is explicitly unsupported for PDF (confirmed by both the shipped `.d.ts` doc
comment and a live throw with `code: 'unsupported'` on both test forms). Even the `Document` model
that mode returns for other formats carries no bounding box, rect, position, or page-index field
anywhere in its type surface, so there would be nothing to map even if PDF were supported. The
Markdown it does produce reconstructs the form's rough visual layout as GFM tables and folds
checkbox/yes-no fields into plain adjacent table-cell text (no field markup, no checked-state, no
page breaks at all), which is a layout *approximation* useful for reading the form, not a source of
field geometry. `pdf-inspector` 1.14.2 (the version actually vendored in the published package,
confirmed against `Cargo.lock` at the `v0.2.4` tag) also reverses Hebrew/Arabic/Persian text — 23-25%
of Hebrew words on these two forms start with a letter that is legal only word-finally — a bug fixed
upstream in `pdf-inspector` 1.16+ but not yet merged into `anydoc` (PR #175 is open, unmerged as of
2026-09-17) or released to npm. For MOBI-10's actual question — locating input fields on flat forms
— this library is a dead end regardless of the RTL bug; a different source (native widgets, a
pdf.js layout pass, or vision-based candidate generation) is needed for geometry.
