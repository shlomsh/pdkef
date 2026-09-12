# LOC-15 reviewer brief: the Indonesian "PDF under 1 MB, photo under 200 KB" page

For the paid native Indonesian reviewer. This is the English skeleton of one page; the reviewer
writes the Indonesian, picks the H1 and slug from the measured keyword family, checks every portal
quote against the portal, and is named in the page's front matter. Ticket:
[backlog/tasks/LOC-15.md](../backlog/tasks/LOC-15.md), which holds the sources, the measurements and
the reasoning behind every constraint below. Nothing here is final copy; it is the shape and the
facts.

## What the page is, in one paragraph

An Indonesian applicant has a form with three separately capped uploads: a photo at 200 KB, a scanned
document at somewhere between 400 KB and 1 MB, and sometimes a minimum size too. This page tells them
what the caps actually are on the portals we could verify, what happens to a real scan and a real
photo when they are pushed under those caps with PDkef's own tools, and what to do when a document
will not fit. It links the English tools, `/compress/` (PDF, target-size mode) and `/compress-image/`
(photo). The tools are not translated; the page says so.

## Voice, from CLAUDE.md, applied in Indonesian

Warm, modest, honest. A person sharing something useful. Plain facts, no intensifiers. First person
is fine. Never name other tools or portals' competitors. Do not say "guaranteed", "best", "fastest".
The privacy line at human altitude: "the file stays on your phone or laptop; nothing is uploaded to
us". No em dashes anywhere in the copy; use commas or spaced hyphens.

## What the reviewer decides

1. **H1 and slug.** Lead with the "under 1 MB" phrasing ("di bawah 1 MB"), not "to 1 MB" ("jadi 1
   MB"): Keyword Planner shows the "under" family growing while the flat phrasing is flat. Candidates
   the data supports: `kompres pdf di bawah 1 mb`, `kompres pdf 1 mb`, `dibawah 1 mb`. Pick the one
   a real person would type, keep the photo half in the title or subhead, not the slug.
2. **The Indonesian for "target size".** PDkef's compress tool calls the mode "Target Size"; the page
   needs one consistent phrase for it (the tool UI stays in English, so the page should say what the
   English button is called once).
3. **Which verified portals to keep.** SSCASN is the anchor and must stay. SNPMB and e-Meterai are
   supporting rows. Anything not verified from the portal's own page stays off the page, or is
   mentioned only as "the number is inside the login and we could not check it".
4. **Two portals to retry from inside Indonesia:** LPDP (`lpdp.kemenkeu.go.id`) and DJP
   (`ereg.pajak.go.id`, Coretax) were unreachable from outside the country on 2026-09-12. If the
   reviewer can read a stated limit on the portal's own page, add it with the URL, the exact
   sentence and the date; if not, leave it out.

## Skeleton

**Kicker:** "Measured, not promised" (same kicker family as the English size-limit page).

**H1:** reviewer's choice from the family above.

**Subhead (draft):** The portals ask for a photo under 200 KB and a document under 1 MB, sometimes
much less. I ran real scans and a real phone photo through PDkef's own compressor at those sizes, so
you can see what fits, what gets soft, and what to do when a file will not get there.

**Primary CTA:** `/compress/` ("Open the PDF compressor, it runs on your device"). Secondary link in
the photo section: `/compress-image/`.

### Section 1. The caps, on the portal's own page

Table, one row per verified limit, each with the portal, the field, the limit as written, the format,
and the source. The reviewer reads every row against the live source before publishing.

| Portal | Field | Limit as written | Format | Source, captured 2026-09-12 |
| --- | --- | --- | --- | --- |
| SSCASN / BKN | Pas Foto | maksimal 200 KB | JPG | sscasn.bkn.go.id/faq/, "Berapa ukuran dan tipe file yang diupload?" |
| SSCASN / BKN | KTP | maksimal 200 KB | JPG | same FAQ; also Buku Panduan v1.1 p.7 |
| SSCASN / BKN | Bukti Bayar | maksimal 200 KB | JPG | same FAQ |
| SSCASN / BKN | Transkrip, Surat Lamaran | maksimal 400 KB | PDF | same FAQ |
| SSCASN / BKN | Rapor, Surat Keterangan | maksimal 500 KB | PDF | same FAQ |
| SSCASN / BKN | Ijazah | maksimal 700 KB | PDF | same FAQ |
| SSCASN / BKN | Dokumen Lainnya | maksimal 1 MB | PDF | same FAQ |
| SSCASN / BKN | Surat lamaran, ijazah, transkrip, one live 2026 formation | 1000 KB each; pas foto 500 KB | PDF; JPG | Buku Panduan v1.1 p.25-26, Gambar 4.10 |
| SNPMB, UTBK-SNBT 2026 | Bukti Tunanetra form | tidak lebih dari 300 KB | PDF | Panduan Pendaftaran UTBK-SNBT 2026, p.6 |
| SNPMB, SNBP 2026 | Bukti Prestasi | maksimal 2MB | PDF, PNG, JPG | Panduan Pendaftaran SNBP 2026, p.10 |
| e-Meterai | Document to be stamped | maksimal 4 MB | PDF | e-meterai.co.id/faqs |

Prose after the table, three points the reviewer keeps:

- SSCASN's caps are set per agency and formation ("sesuai dengan ketentuan yang diinput oleh Admin
  Instansi"). The FAQ table is the reference; your formation's document tab is the truth. Check it
  before compressing, because 700 KB and 1000 KB are different targets.
- SSCASN also has a **minimum**: 80 KB per file in the guide's text, 100 KB in its screenshot. A file
  can be rejected for being too small. Do not compress a one-page scan to 50 KB "to be safe".
- Portals do not say whether 200 KB means 200,000 or 204,800 bytes. Aim about ten percent under the
  cap and the question never comes up.

### Section 2. What a scan looks like under 1 MB

The measured table from the ticket, trimmed to the rows the page needs: 2, 5, 10, 20 and 40 pages at
a 1 MB target, with input size, output size, seconds, and the honest grade. State how the files were
made (synthetic phone scans of a typed document, so that the numbers can be reproduced without
anyone's real ijazah). Plain reading:

- Up to ten scanned pages fit under 1 MB and stay crisp. That covers surat lamaran, ijazah,
  transkrip, and most surat keterangan.
- Twenty pages usually fit; forty came in a hair over and looked slightly blocky. A dense scan (small
  print, a full page of text) will hit the limit sooner than our test pages did.
- A typed PDF that is already small is left exactly as it is, byte for byte. The tool only
  re-encodes when the target requires it.
- Every run here finished in under three seconds, on the device, with nothing uploaded.

### Section 3. The awkward part: when a document will not fit

- A long scan cannot reach a small cap and stay readable. Say what to do instead, in this order:
  split the file and upload only the pages the formation asks for; rescan at a lower resolution
  rather than compressing a huge scan; ask whether the portal takes the document in two parts.
- If the compressor reports "closest achievable size", the file is a little over the target. Try a
  target ten percent lower before assuming the document is too long.
- Never compress the KTP or ijazah below the point where the numbers and the stamp are readable; a
  rejected upload costs a day, an unreadable document costs the application.

### Section 4. The photo under 200 KB

Link `/compress-image/`. The two measured rows: a real 2 MB phone photo to 183 KB (kept full
resolution, picked up colour banding), and a plain pas foto that barely needed compressing. Plain
reading:

- A pas foto on a plain background is under 200 KB with almost nothing lost. That is the normal case.
- A busy photo pushed hard keeps its size in pixels and pays in colour first; if it looks off, resize
  it smaller before compressing.
- The phone's location tag is removed from the compressed file (the tool re-encodes, it does not copy
  metadata). Say it once, plainly.

### Section 5. PDF at 200 KB, a section, not a page

For the person told "under 200 KB" by an employer or a smaller portal. Honest framing: no portal we
could verify asks for a 200 KB PDF, so this is stricter than the caps above. Measured: a two-page
scan reached 203 KB crisp; five pages landed at 206 KB and still crisp. Advice: two to three pages
is comfortable, beyond that split the file.

### FAQ (six to eight, mirrored in JSON-LD, so every answer must be on the page)

1. Why does the portal reject a file that is already under 1 MB? (the per-document caps, the
   minimum, the KB unit)
2. How many scanned pages fit under 1 MB? (ten crisp, twenty usually, dense scans sooner)
3. Does compressing to 1 MB make the document unreadable? (no at ten pages; the long-scan case)
4. My PDF is 1.1 MB after compressing. What now? (target ten percent lower, split)
5. Is the pas foto still accepted after compressing? (yes; keep the 3x4 or 4x6 ratio; no metadata)
6. Do my documents get uploaded anywhere when I compress them? (no; on the device; offline works)
7. Which format should I use, PDF or JPG? (what the portal row says; the tool keeps the input format)
8. Why is the tool in English? (honest: only the guide is translated for now; the two buttons are
   named here)

## Front matter the reviewer fills

`reviewer` (name, as it should appear), `reviewedAt` (date), `reviewNotes` (what was changed from
this brief and why, in English, 20 to 600 characters). `status: published` is refused by the build
without all three.

## What is not on this page

No generic "kompres PDF" pitch, no list of other tools, no second Indonesian page, no claim about a
portal we could not read ourselves, no "1 to 2 MB for job applications" (that is an HR convention,
not a cap).
