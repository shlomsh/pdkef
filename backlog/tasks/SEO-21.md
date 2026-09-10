---
id: "SEO-21"
title: "New tool: flatten a PDF, which also closes a defect in the Sign export"
status: "open"
priority: "P2"
epic: "search-acquisition"
phase: "near-term"
depends_on: ["MOBI-02", "SEO-06"]
legacy_state: "Open"
---

# SEO-21 · New tool: flatten a PDF, which also closes a defect in the Sign export

## Scope and acceptance

**`flatten pdf online` is 20k-50k a month against weak competition, and we need the capability
internally regardless of whether we ship the page.** MOBI-02 records the defect: `signPdf` never touches
the AcroForm, so a source PDF with form fields exports with every widget annotation intact and empty,
painted over the answers PDkef just drew. The sender sees their text because pdf.js renders widget
appearance streams as page content; the recipient sees empty boxes.

So this is one piece of work with two outputs: the flattening logic, used by the Sign export path, and a
tool page for people searching for it directly. Build it once.

**MOBI-02 owns the policy decision and this ticket depends on it** - flatten always, never, or only when
PDkef drew something overlapping a widget rect. Do not re-litigate it here; if MOBI-02 has not chosen,
this ticket waits, because the tool's behaviour has to be the same behaviour.

**Two complications MOBI-02 already names, repeated because they are easy to skip.** `getForm()` in
`@cantoo/pdf-lib` strips XFA data unless the document was loaded with `preserveXFA`, so merely asking
whether a form exists can silently degrade a hybrid document. And `form.flatten()` regenerates
appearances, needs a font, and throws on some documents - a document we cannot flatten must fail loudly
rather than quietly returning the unflattened file, which would be a silent wrong answer of exactly the
kind this tool exists to prevent.

**What "flatten" means to a searcher is broader than AcroForm fields**, and the page should be precise
about which of these it does: form fields, annotations and comments, layers, and transparency. Claiming
all four and doing one is how a tool gets a reputation. State the scope.

**Acceptance.**

- One flattening implementation in `src/lib/` (or the appropriate `src/editor/adapters/pdf/` home), used
  by both the Sign export path and the new tool. No second copy.
- MOBI-02's acceptance is satisfied by the same change: a filled form exports with no live editable field
  covering the drawn answers, verified in Chrome's viewer and macOS Preview, both named with what each
  showed before and after.
- A document with no form exports byte-comparably to today, proving the path is inert on the common case.
- A document that cannot be flattened fails loudly.
- The page states exactly which kinds of flattening it performs, and that flattening ends the document's
  life as a fillable form.
- Registered in `src/data/tools.js`; How it works and FAQ with matching `<SeoSchema>`; no `noindex`;
  `npm run build && npm run preview` CSP pass.
