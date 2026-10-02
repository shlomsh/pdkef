---
id: "ENC-12"
title: "Merge tells a protected file from an unreadable one"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
order: 5
depends_on: ["ENC-01"]
---

# ENC-12 · Merge tells a protected file from an unreadable one

*Plan sections 2 and 4.* Merge is the only tool with a complete per-file card and an Unlock link today, and it has two gaps found by running it.
- `inspectPdf` calls `doc.getCreationDate()` outside its try (`merge.js:75`). On a file whose Info dictionary is encrypted (pypdf's output, and in practice most encryptors') it throws, and `PdfMergeTool.tsx:638` turns that into "unreadable", so the person is told the file is damaged instead of protected (3 of 4 variants, both kinds).
- It refuses an owner-only file as "encrypted" (`merge.js:80`, `:214`) though pdf.js and `{password: ''}` handle it.

## Brief
- Classify each entry with the ENC-01 classifier (the thumbnail load is already pdf.js); keep the per-file card; make the Unlock link a hand-off (`sendToUnlock` with `from=merge`).

## Acceptance
- Unit: a protected file with an encrypted Info dictionary shows the protected card, not "unreadable"; an owner-only file shows the card with the owner-restricted wording.
