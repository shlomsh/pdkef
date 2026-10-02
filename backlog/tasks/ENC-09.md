---
id: "ENC-09"
title: "Merge tells a protected file from an unreadable one, and takes the unlocked file back"
status: "open"
priority: "P3"
epic: "robustness"
horizon: "later"
order: 3
depends_on: ["ENC-01"]
---

# ENC-09 · Merge tells a protected file from an unreadable one, and takes the unlocked file back

*Plan sections 2 and 4. Shlomi: Merge is in, after the Redact flow.* Two gaps found by running it.
- `inspectPdf` calls `doc.getCreationDate()` outside its try (`merge.js:75`). On a file whose Info dictionary is encrypted (pypdf's output, and in practice most encryptors') it throws, and `PdfMergeTool.tsx:638` turns that into "unreadable", so the person is told the file is damaged instead of protected (3 of 4 variants).
- It refuses an owner-only file as "encrypted" (`merge.js:80`, `:214`) though pdf.js and `{password: ''}` handle it.

## Brief
- Classify each entry with the ENC-01 classifier; keep the per-file card; make its Unlock link a hand-off.
- Merge has no receiver, and it needs a different one: the set is already open, so the returned file goes into the slot the protected file held. Unlock's "Merge it" verb would use the same hand-off.

- The detour contract (2026-10-02, Shlomi's QA): the tool that meets a protected file parks it for Unlock with `from: '<its key>'`; Unlock's done state then leads with "Continue in <tool>" and a quiet download, and hands the unlocked file back (`RETURN_TO` in `PdfSecurityTool.tsx`, guideline 13). For Merge the way back adds the unlocked file to the list it came from, not a fresh one; settle that here.

## Acceptance
- Unit: a protected file with an encrypted Info dictionary shows the protected card, not "unreadable"; a round trip returns the file into the same slot with the rest of the set untouched.
