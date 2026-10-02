---
id: "ENC-13"
title: "Unlock writes a damaged copy: titles lost, some files will not open"
status: "done"
priority: "P1"
epic: "robustness"
depends_on: []
---

# ENC-13 · Unlock writes a damaged copy

Reported 2026-10-02: protect a PDF, unlock it with the same password, and the result does not open.

## What was measured
- Protect is sound: pdf.js and pypdf both open every protected file in the repo with the password.
- Unlock (`unlockPdf`: pdf-lib `load({ password })` then `save()`) damages the copy. Every titled PDF in
  the repo (11) loses its title; `thai-pnd90-2565.pdf` (xref + object streams, 5 pages) comes out
  unreadable ("Illegal character: 41" in pdf.js).
- The old round-trip test used `num-1.pdf`, which has no title and a trivial structure.

## Acceptance
- `security.test.js` round trips (with and without object streams, plus the real Thai form) compare
  pages, title and form field values through pdf.js, and pass. They were seen red first.

## Root cause and fix (2026-10-02)
Two bugs in `@cantoo/pdf-lib` 2.11.1, fixed in `patches/@cantoo+pdf-lib+2.11.1.patch` (es and cjs):
- **Unlock** decrypted the cross-reference stream, which is never encrypted (ISO 32000 7.5.8.2). It
  turned to garbage, the trailer lost /Info and /ID, and pdf-lib made a fresh empty /Info: the title
  vanished. `PDFObjectParser.parseDictOrStream` now skips `/Type /XRef`.
- **Protect** encrypted only streams, so strings in objects written outside an object stream (page
  dicts, catalog) stayed plaintext under `/StrF /StdCF`. A reader decrypted them into garbage, and
  `parseString` stored that garbage as an unescaped literal, so a stray `)` broke the parse of the
  Thai form. `PDFWriter.encrypt` now encrypts every nested string (`encryptStrings`), and a decrypted
  string comes back as a hex string, which cannot break parsing.
The existing XRef `PDFInvalidObject` workaround in the same patch is now redundant but harmless.
