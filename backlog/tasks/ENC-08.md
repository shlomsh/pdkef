---
id: "ENC-08"
title: "Merge tells a protected file from an unreadable one, and takes it back unlocked"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
order: 7
depends_on: ["ENC-01", "ENC-03"]
---

# ENC-08 · Merge tells a protected file from an unreadable one, and takes it back unlocked

*Plan section 2 and 4.* Merge is the only tool with a complete per-file card and an Unlock link today,
and it has two gaps found by running it.

- `inspectPdf` calls `doc.getCreationDate()` outside its try (`merge.js:~88`). On a file whose Info
  dictionary is encrypted (pypdf's output, and in practice most encryptors') it throws, and
  `PdfMergeTool.tsx:638` turns that into "unreadable", so the person is told the file is damaged instead of
  protected. 3 of 4 variants, both kinds.
- It refuses an owner-only file as "encrypted" though pdf.js and `{password: ''}` both handle it.

## Brief
- Classify each entry with the ENC-01 classifier (the thumbnail load is already pdf.js); keep the per-file
  card and make the Unlock link a hand-off with `from=merge`.
- Merge has no hand-off receiver: add one that inserts the returned file into the set already open (the
  draft keeps the other files), at the position the protected file held. This is the part that may need
  its own ticket; if it grows, split it out and close this one on the classification.

## Acceptance
- Unit: a protected file with an encrypted Info dictionary shows the protected card, not "unreadable".
- A round trip from the card returns the file into the same slot and Merge's draft is untouched.
